import { useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, Bus, Calendar as CalendarIcon, ChevronDown, ChevronRight, Clock } from 'lucide-react';
import { useTimetable } from '../lib/data';
import { STORAGE_KEYS, readString, writeString } from '../lib/storage';
import { operatorBadge, routeBadge } from '../lib/palette';
import TripDetailDialog from '../components/TripDetailDialog';
import { pressable } from '../lib/a11y';
import {
  availableStops,
  carryoverHits,
  clockNote,
  connects,
  directionFor,
  filterByPeriod,
  filterNow,
  findTrips,
  nextOperatingDay,
  parseYmd,
  periodModeOf,
  previousHit,
  ymd,
} from '../lib/logic';
import type { Hit, Trip } from '../types';

const WEEKS = ['日', '月', '火', '水', '木', '金', '土'];
const PAGE = 5;

// 24時以降の時刻(24:10 など)の隣に添える「翌0:10」
function NextDay({ t }: { t: string | undefined }) {
  const note = clockNote(t);
  return note ? <span className="text-[10px] font-medium text-slate-500 ml-1 whitespace-nowrap">{note}</span> : null;
}

export default function Home() {
  const data = useTimetable();
  const { site, stopsById } = data;
  const periods = site.periods?.enabled ? site.periods : null;
  const multiDirection = site.directions.length > 1;

  // 乗車地・降車地・方向の初期値: 前回の選択 → サイトの既定 → 選べる停留所の先頭と末尾。
  // 乗車地と降車地は必ず別の停留所にする。
  const [initial] = useState(() => {
    const firstDir = site.directions[0].id;
    const savedDir = readString(STORAGE_KEYS.direction);
    const dir0 = site.directions.some((d) => d.id === savedDir) ? savedDir! : firstDir;
    const choices = availableStops(data, new Date()).map((s) => s.id);
    const exists = (id: string | null | undefined): id is string => !!id && !!stopsById.get(id) && !stopsById.get(id)!.hidden;
    const def = site.defaults?.[dir0];
    let from = [readString(STORAGE_KEYS.stopFrom), def?.from, choices[0]].find(exists) ?? data.stops[0].id;
    let to = [readString(STORAGE_KEYS.stopTo), def?.to, choices[choices.length - 1]].find((id) => exists(id) && id !== from);
    if (!to) to = choices.find((id) => id !== from) ?? data.stops.find((s) => s.id !== from)?.id ?? from;
    if (from === to) from = choices.find((id) => id !== to) ?? from;
    return { from, to, dir: directionFor(data, from, to) ?? dir0 };
  });
  const [direction, setDirection] = useState<string>(initial.dir);
  const [stopFrom, setStopFrom] = useState<string>(initial.from);
  const [stopTo, setStopTo] = useState<string>(initial.to);

  const [now, setNow] = useState<Date>(() => new Date());
  // 日付は、利用者が選ぶまでは「いまの日付」に自動で追従する(夜に開いたまま日付が変わっても古い曜日にならない)
  const [dateOverride, setDateOverride] = useState<Date | null>(null);
  const todayKey = ymd(now);
  const today = useMemo(() => parseYmd(todayKey), [todayKey]);
  const date = dateOverride ?? today;

  const [periodId, setPeriodId] = useState<string>('now');
  const [showStopEditor, setShowStopEditor] = useState(false);
  const [selected, setSelected] = useState<Trip | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(PAGE);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setVisibleLimit(PAGE);
  }, [date, stopFrom, stopTo, direction, periodId]);

  const persist = (from: string, to: string, dir: string) => {
    writeString(STORAGE_KEYS.stopFrom, from);
    writeString(STORAGE_KEYS.stopTo, to);
    writeString(STORAGE_KEYS.direction, dir);
  };
  const apply = (from: string, to: string, dir: string) => {
    setStopFrom(from);
    setStopTo(to);
    setDirection(dir);
    persist(from, to, dir);
  };

  // 方向タブ: 乗車地と降車地を入れ替えて、方向を切り替える
  const changeDirection = (dir: string) => {
    if (dir !== direction) apply(stopTo, stopFrom, dir);
  };

  // 入れ替え: 逆向きの便がある区間のときだけ使える。方向は、入れ替えた区間から決め直す
  const canSwap = connects(data, stopTo, stopFrom);
  const swapStops = () => {
    if (canSwap) apply(stopTo, stopFrom, directionFor(data, stopTo, stopFrom) ?? direction);
  };

  // 停留所を選ぶ。乗車地と降車地が同じになるときは、もう一方を入れ替える。
  // その区間を結ぶ方向へ自動で切り替える。
  const selectStop = (kind: 'from' | 'to', value: string) => {
    let from = stopFrom, to = stopTo;
    if (kind === 'from') { if (value === to) to = from; from = value; }
    else { if (value === from) from = to; to = value; }
    apply(from, to, directionFor(data, from, to) ?? direction);
  };

  const stopName = (id: string) => stopsById.get(id)?.name ?? '';
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const stopChoices = useMemo(() => availableStops(data, date), [data, date]);
  // 選択肢: その日に選べる停留所 + いま選んでいる停留所(その日に停まらなくても、表示と状態がずれないように残す)
  const optionsFor = (other: string, current: string) => {
    const list = stopChoices.filter((s) => s.id !== other);
    if (!list.some((s) => s.id === current) && stopsById.get(current)) list.push(stopsById.get(current)!);
    return list;
  };
  const notRunning = [stopFrom, stopTo].filter((id) => !stopChoices.some((s) => s.id === id));

  const hits = useMemo(() => findTrips(data, date, stopFrom, stopTo, direction), [data, date, stopFrom, stopTo, direction]);

  const isToday = ymd(date) === todayKey;
  const nowMode = periodId === 'now';
  const liveMode = nowMode && isToday;

  // 0時〜運行日の切り替え前は、前日のダイヤでまだ走っている便(24:10 発など)も出す
  const carry = useMemo(
    () => (liveMode ? carryoverHits(data, now, stopFrom, stopTo, direction) : []),
    // now は10秒ごとに変わるが、分が変わるまで結果は同じなので、分で更新する
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liveMode, data, stopFrom, stopTo, direction, nowMin, todayKey],
  );
  const carrySet = useMemo(() => new Set(carry), [carry]);

  const resultHits = useMemo(
    () => (nowMode ? filterNow(hits, nowMin) : filterByPeriod(site, hits, direction, periodId)),
    [hits, nowMode, nowMin, site, direction, periodId],
  );
  const prev = useMemo(() => (liveMode && carry.length === 0 ? previousHit(hits, nowMin) : null), [liveMode, carry, hits, nowMin]);

  // 今日以外の日付を見ているときは「いま」ではなく、その日の始発から並べる
  const list: Hit[] = liveMode ? [...carry, ...resultHits] : nowMode ? hits : resultHits;

  const dayDiff = Math.round((date.getTime() - today.getTime()) / 86400000);
  const dateLabel = `${dayDiff === 0 ? '今日 ' : dayDiff === 1 ? '明日 ' : ''}${date.getMonth() + 1}月${date.getDate()}日（${WEEKS[date.getDay()]}）`;

  const periodHeading = () => {
    const p = periods?.items.find((x) => String(x.id) === periodId);
    if (!p || !periods) return '';
    return periodModeOf(site, direction) === 'depart_after_end'
      ? `${p.id}${periods.label}の終了(${p.end})後に乗れる便`
      : `${p.id}${periods.label}(${p.start}開始)に間に合う便`;
  };

  // 発車までの残り分。前日のダイヤの続きの便は、1440分(24時間)ぶん進めて数える
  const minutesLeft = (h: Hit) => h.dep - (carrySet.has(h) ? nowMin + 1440 : nowMin);
  const countdown = (m: number) => (m <= 0 ? 'まもなく' : m < 60 ? `あと${m}分` : `あと${Math.floor(m / 60)}時間${m % 60}分`);

  // スクリーンリーダー用の読み上げ: 「07:00発 07:18着 駅・営業所線。停車するバス停を表示」
  const tripLabel = (h: Hit) =>
    `${h.times[h.fromId]}発 ${h.times[h.toId]}着${data.routes.length > 1 ? ' ' + h.route.name : ''}。停車するバス停を表示`;

  const platformOf = (h: Hit) => stopsById.get(h.fromId)?.platforms?.[h.route.id];

  // 結果が無いときの理由を、3つに分けて伝える
  const renderEmpty = () => {
    const hasSection = connects(data, stopFrom, stopTo, direction);
    const next = hasSection ? nextOperatingDay(data, date, stopFrom, stopTo, direction) : null;
    let title: string, body: string;
    if (!hasSection) {
      title = 'この区間に便がありません';
      body = '乗車地・降車地を変えてください。';
    } else if (hits.length === 0 && carry.length === 0) {
      title = 'この日は運行がありません';
      body = '運休日や休業期間の可能性があります。';
    } else if (liveMode) {
      title = '本日の運行は終了しました';
      body = '';
    } else if (periods && !nowMode) {
      title = `${periodHeading()}はありません`;
      body = '別の時間割や日付を試してください。';
    } else {
      title = '該当する便がありません';
      body = '日付を変えて探せます。';
    }
    const showNext = hasSection && !!next && (hits.length === 0 || liveMode);
    return (
      <div className="bg-white rounded-2xl p-6 border border-dashed border-slate-200 text-center space-y-2">
        <Bus className="w-8 h-8 text-slate-300 mx-auto" />
        <div className="space-y-1">
          <h3 className="font-medium text-slate-700 text-sm">{title}</h3>
          {body && <p className="text-[12px] text-slate-700 leading-normal max-w-[240px] mx-auto">{body}</p>}
        </div>
        {showNext && next && (
          <button
            onClick={() => { setDateOverride(next.date); setPeriodId('now'); }}
            className="text-[13px] font-semibold text-orange-700 underline underline-offset-2 bg-transparent border-none cursor-pointer min-h-11"
          >
            {dayDiff === 0 && next.date.getTime() - today.getTime() === 86400000 ? '明日' : `${next.date.getMonth() + 1}/${next.date.getDate()}(${WEEKS[next.date.getDay()]})`}の始発 {next.hit.times[next.hit.fromId]} 発を見る
          </button>
        )}
      </div>
    );
  };

  const renderCard = (h: Hit, variant: 'prev' | 'next' | 'later') => {
    const isPast = variant === 'prev';
    const isNext = variant === 'next';
    const op = h.trip.operator ? site.operators?.[h.trip.operator] : undefined;
    const platform = platformOf(h);
    const showCountdown = liveMode && !isPast;

    return (
      <div
        key={h.trip.id + (carrySet.has(h) ? '-carry' : '')}
        {...pressable(() => setSelected(h.trip), tripLabel(h))}
        className={`relative isolate overflow-hidden bg-white rounded-2xl border p-4 flex flex-col gap-3 cursor-pointer transition-colors active:bg-slate-50 ${
          isPast ? 'border-slate-200 opacity-60' : isNext ? 'border-orange-200' : 'border-slate-200'
        }`}
      >
        <div className="flex justify-between items-center gap-2">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            {data.routes.length > 1 && (
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md shrink-0 ${routeBadge(h.route.color)}`}>{h.route.name}</span>
            )}
            {op && <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md shrink-0 ${operatorBadge(op.color)}`}>{op.name}</span>}
            {h.trip.label && <span className="text-[11px] font-medium px-2 py-0.5 rounded-md shrink-0 bg-slate-100 text-slate-700">{h.trip.label}</span>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {showCountdown && (
              <div className={`flex items-center gap-1 ${isNext ? 'text-orange-700' : 'text-slate-700'}`}>
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[12px] font-semibold tabular-nums">{countdown(minutesLeft(h))}</span>
              </div>
            )}
            {isPast && <span className="text-[11px] font-medium text-slate-700">発車済み</span>}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-1.5">
            <span className={`text-[28px] font-semibold tabular-nums leading-none ${isPast ? 'text-slate-500' : 'text-slate-900'}`}>{h.times[h.fromId]}</span>
            <span className="text-xs font-medium text-slate-700">発</span>
            <NextDay t={h.times[h.fromId]} />
          </div>
          <div className="text-slate-500 shrink-0 select-none">→</div>
          <div className="flex items-baseline gap-1.5 justify-end">
            <span className="text-lg font-medium text-slate-900 tabular-nums leading-none">{h.times[h.toId]}</span>
            <span className="text-xs font-medium text-slate-700">着</span>
            <NextDay t={h.times[h.toId]} />
          </div>
        </div>

        {(platform || h.fromId !== stopFrom || h.toId !== stopTo) && (
          <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3 flex-wrap">
              {platform && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-700 text-[11px] font-medium">のりば</span>
                  <span className="bg-orange-50 text-orange-700 font-semibold px-2.5 py-0.5 rounded-lg text-sm tabular-nums">{platform}</span>
                </div>
              )}
              {h.fromId !== stopFrom && (
                <span className="bg-teal-50 text-teal-700 font-semibold px-2.5 py-0.5 rounded-lg text-sm">乗り場: {stopName(h.fromId)}</span>
              )}
              {h.toId !== stopTo && (
                <span className="bg-teal-50 text-teal-700 font-semibold px-2.5 py-0.5 rounded-lg text-sm">降り場: {stopName(h.toId)}</span>
              )}
            </div>
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </div>
        )}
      </div>
    );
  };

  const renderRow = (h: Hit) => {
    const op = h.trip.operator ? site.operators?.[h.trip.operator] : undefined;
    const platform = platformOf(h);
    return (
      <div key={h.trip.id} {...pressable(() => setSelected(h.trip), tripLabel(h))} className="px-4 py-3.5 min-h-11 hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 w-3/5 min-w-0">
            <span className="text-lg font-semibold text-slate-900 tabular-nums leading-none shrink-0">
              {h.times[h.fromId]}
              <NextDay t={h.times[h.fromId]} />
            </span>
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              {data.routes.length > 1 && (
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${routeBadge(h.route.color)}`}>{h.route.name}</span>
              )}
              {op && <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${operatorBadge(op.color)}`}>{op.name}</span>}
              {h.trip.label && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 bg-slate-100 text-slate-700">{h.trip.label}</span>}
            </div>
          </div>
          <div className="text-right shrink-0 flex items-center gap-2">
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-baseline gap-0.5">
                <span className="text-[15px] font-medium text-slate-900 tabular-nums leading-none">{h.times[h.toId]}</span>
                <span className="text-[11px] font-medium text-slate-700">着</span>
                <NextDay t={h.times[h.toId]} />
              </div>
              {platform && (
                <span className="text-[11px] text-slate-700 font-medium flex items-center gap-1">
                  <span>のりば</span>
                  <span className="text-orange-700 bg-orange-50 font-semibold px-1.5 py-0.5 rounded tabular-nums leading-none">{platform}</span>
                </span>
              )}
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
          </div>
        </div>
      </div>
    );
  };

  const isEmpty = list.length === 0 && !prev;
  const showStopEditorUi = stopChoices.length > 1 || data.stops.filter((s) => !s.hidden).length > 1;

  return (
    <div className="bg-slate-50 pb-16 w-full flex-1">
      <h1 className="sr-only">{site.name} 時刻表</h1>

      {/* 方向タブ(方向が1つだけのサイトでは出さない) */}
      {multiDirection && (
        <div className="sticky top-16 z-30 bg-slate-50 p-3 pb-0">
          <div className="bg-slate-100 p-1 rounded-2xl grid gap-1" style={{ gridTemplateColumns: `repeat(${site.directions.length}, minmax(0, 1fr))` }}>
            {site.directions.map((d) => (
              <button
                key={d.id}
                onClick={() => changeDirection(d.id)}
                aria-pressed={direction === d.id}
                className={`min-h-11 py-2.5 px-3 text-sm rounded-xl transition-colors cursor-pointer text-center flex items-center justify-center gap-1.5 ${
                  direction === d.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-700'
                }`}
              >
                <span className={`font-medium ${direction === d.id ? 'text-orange-700' : ''}`}>{d.label}</span>
                {d.sub && <span className="text-xs text-slate-700">{d.sub}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 検索条件 */}
      <div className="p-3 pt-2">
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="border-b border-slate-100">
            <button
              onClick={() => showStopEditorUi && setShowStopEditor((p) => !p)}
              aria-expanded={showStopEditor}
              className="w-full min-h-11 py-2.5 px-4 flex items-center gap-2 cursor-pointer"
            >
              <span className="min-w-0 text-sm font-medium text-slate-900 line-clamp-2 text-left">{stopName(stopFrom)}</span>
              <span className="text-slate-500 shrink-0">→</span>
              <span className="min-w-0 flex-1 text-left text-sm font-medium text-slate-900 line-clamp-2">{stopName(stopTo)}</span>
              {showStopEditorUi && <ChevronDown className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${showStopEditor ? 'rotate-180' : ''}`} />}
            </button>

            {showStopEditor && showStopEditorUi && (
              <div className="px-4 pb-3 relative">
                <div className="relative flex items-center">
                  <div className="absolute left-[15px] top-[24px] bottom-[24px] w-px bg-slate-200" />
                  <div className="flex-1 space-y-1">
                    <div className="relative flex items-center gap-3.5 py-2 px-2 pr-12 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-orange-300">
                      <div className="w-[30px] h-[30px] rounded-full bg-orange-50 border border-orange-200 text-orange-700 shrink-0 flex items-center justify-center text-xs font-semibold z-10 select-none">発</div>
                      <div className="flex-1 min-w-0 flex flex-col items-start text-left">
                        <span className="text-[11px] text-slate-700 mb-0.5 leading-none">乗車地</span>
                        <span className="text-base font-medium text-slate-900 truncate leading-tight">{stopName(stopFrom)}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                      <select aria-label="乗車地" value={stopFrom} onChange={(e) => selectStop('from', e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full">
                        {optionsFor(stopTo, stopFrom).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <div className="h-px bg-slate-100 ml-[46px] mr-10" />
                    <div className="relative flex items-center gap-3.5 py-2 px-2 pr-12 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-orange-300">
                      <div className="w-[30px] h-[30px] rounded-full bg-blue-50 border border-blue-200 text-blue-600 shrink-0 flex items-center justify-center text-xs font-semibold z-10 select-none">着</div>
                      <div className="flex-1 min-w-0 flex flex-col items-start text-left">
                        <span className="text-[11px] text-slate-700 mb-0.5 leading-none">降車地</span>
                        <span className="text-base font-medium text-slate-900 truncate leading-tight">{stopName(stopTo)}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                      <select aria-label="降車地" value={stopTo} onChange={(e) => selectStop('to', e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full">
                        {optionsFor(stopFrom, stopTo).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  </div>
                  {canSwap && (
                    <button onClick={swapStops} aria-label="乗車地と降車地を入れ替え" title="乗車地と降車地を入れ替え" className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-full cursor-pointer w-11 h-11 transition-colors shrink-0 z-20">
                      <ArrowDownUp className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {notRunning.length > 0 && (
            <p className="px-4 py-2 text-[12px] text-orange-700 bg-orange-50 border-b border-slate-100">
              {notRunning.map(stopName).join('・')}は、この日は停まりません。
            </p>
          )}

          <div className="relative border-b border-slate-100 py-3.5 px-4 flex items-center group focus-within:ring-2 focus-within:ring-inset focus-within:ring-orange-300">
            <div className="flex items-center gap-2.5 relative flex-1 min-w-0 justify-between">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <CalendarIcon className="w-4 h-4 text-slate-500" />
                <span className="text-[11px] text-slate-700 shrink-0">日付</span>
                <span className="text-sm font-medium text-slate-900 truncate">{dateLabel}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
              <input
                type="date"
                aria-label="日付"
                value={ymd(date)}
                onChange={(e) => { if (e.target.value) setDateOverride(parseYmd(e.target.value)); }}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
            </div>
          </div>
          {dateOverride && ymd(dateOverride) !== todayKey && (
            <button onClick={() => setDateOverride(null)} className="w-full text-left px-4 min-h-11 text-[13px] font-semibold text-orange-700 border-b border-slate-100 bg-transparent cursor-pointer">
              今日に戻す
            </button>
          )}

          {periods && (
            <div className="p-3">
              <h4 className="text-[11px] text-slate-700 mb-2">時間割から絞り込む</h4>
              <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none scroll-smooth">
                {[{ id: 'now', label: '現在時刻' }, ...periods.items.map((p) => ({ id: String(p.id), label: `${p.id}${periods.label}` }))].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPeriodId(p.id)}
                    aria-pressed={periodId === p.id}
                    className={`h-11 px-4 rounded-full text-[13px] shrink-0 transition-colors cursor-pointer flex items-center justify-center ${
                      periodId === p.id ? 'bg-orange-700 text-white font-semibold' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 結果 */}
      <div className="px-3 mt-1.5 space-y-3">
        {isEmpty ? (
          renderEmpty()
        ) : liveMode ? (
          <div className="space-y-3">
            {prev && renderCard(prev, 'prev')}
            {list.slice(0, 3).map((h, i) => renderCard(h, i === 0 ? 'next' : 'later'))}
            {list.length > 3 && (
              <div className="space-y-1.5">
                <span className="text-[12px] font-medium text-slate-700 ml-1.5 block">以降の便</span>
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                  {list.slice(3, visibleLimit).map(renderRow)}
                </div>
              </div>
            )}
            {list.length === 0 && renderEmpty()}
          </div>
        ) : (
          <div className="space-y-1.5">
            <span className="text-[12px] font-medium text-slate-700 ml-1.5 block">{nowMode ? `${dateLabel}の便` : periodHeading()}</span>
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
              {list.slice(0, visibleLimit).map(renderRow)}
            </div>
          </div>
        )}

        {list.length > visibleLimit && (
          <button
            onClick={() => setVisibleLimit((p) => p + PAGE)}
            className="w-full min-h-11 py-2.5 rounded-2xl border border-dashed border-slate-200 text-slate-500 hover:text-orange-700 hover:border-orange-300 text-[13px] transition-colors bg-white hover:bg-orange-50/40 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            さらに{list.length - visibleLimit}件を表示
            <ChevronDown className="w-4 h-4" />
          </button>
        )}
      </div>

      <TripDetailDialog trip={selected} date={date} fromId={stopFrom} toId={stopTo} now={isToday ? now : undefined} onClose={() => setSelected(null)} />
    </div>
  );
}
