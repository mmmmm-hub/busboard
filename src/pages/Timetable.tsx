import { useMemo, useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import { Card } from '../components/ui';
import SegmentedToggle from '../components/SegmentedToggle';
import TripDetailDialog from '../components/TripDetailDialog';
import { useTimetable } from '../lib/data';
import { operatorBadge, routeBadge } from '../lib/palette';
import { STORAGE_KEYS, readString, writeString } from '../lib/storage';
import { cellTime, dayType, isInBreak, toMin, tripRuns, tripTimes } from '../lib/logic';
import type { DayType, Trip } from '../types';

const DAY_LABEL: Record<DayType, string> = { weekday: '平日', saturday: '土曜', holiday: '土日祝' };

// 選んだ種別(平日/土曜/日祝 × 通常期/休業期)に当てはまる、直近の実際の日付を探す
function representativeDate(site: ReturnType<typeof useTimetable>['site'], day: DayType, inBreak: boolean): Date {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const probe = new Date(start);
  for (let i = 0; i < 800; i++) {
    if (dayType(site, probe) === day && !!isInBreak(site, probe) === inBreak) return new Date(probe);
    probe.setDate(probe.getDate() + 1);
  }
  return start;
}

export default function TimetablePage() {
  const data = useTimetable();
  const { site, stopsById, routes, trips } = data;

  // 方向は、ホームで最後に使っていたものから始める
  const [direction, setDirection] = useState(() => {
    const saved = readString(STORAGE_KEYS.direction);
    return site.directions.some((d) => d.id === saved) ? saved! : site.directions[0].id;
  });
  const hasBreaks = (site.calendar?.breaks ?? []).length > 0;
  const saturdayAsHoliday = site.calendar?.saturdayAs !== 'saturday';
  const [day, setDay] = useState<DayType>(() => {
    const d = dayType(site, new Date());
    return d;
  });
  const [inBreak, setInBreak] = useState<boolean>(() => !!isInBreak(site, new Date()));
  const [selected, setSelected] = useState<Trip | null>(null);

  const activeDate = useMemo(() => representativeDate(site, day, inBreak), [site, day, inBreak]);

  // 選べる停留所: この方向の全停留所(+ timetableColumns に書かれた仮想の停留所)。
  // 路線ごとに停車順が違っても自然に並ぶよう、いちばん多くの便が停まる停留所(基準)との
  // 時刻差の平均で並べる(基準より前に停まる停留所はマイナス)
  const candidates = useMemo(() => {
    const dirTrips = trips.filter((t) => t.direction === direction);
    const freq = new Map<string, number>();
    for (const t of dirTrips) for (const id of Object.keys(t.times)) freq.set(id, (freq.get(id) ?? 0) + 1);
    const anchor = [...freq.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
    const acc = new Map<string, { sum: number; n: number }>();
    for (const t of dirTrips) {
      const base = anchor ? toMin(t.times[anchor]) : null;
      if (base == null) continue;
      for (const [id, v] of Object.entries(t.times)) {
        const m = toMin(v);
        if (m == null) continue;
        const a = acc.get(id) ?? { sum: 0, n: 0 };
        acc.set(id, { sum: a.sum + (m - base), n: a.n + 1 });
      }
    }
    const mean = (id: string) => {
      const a = acc.get(id);
      return a ? a.sum / a.n : null;
    };
    const pos = (id: string) => {
      const own = mean(id);
      if (own != null) return own;
      const via = (stopsById.get(id)?.alias ?? []).map(mean).filter((n): n is number => n != null);
      return via.length ? Math.min(...via) + 0.01 : Infinity;
    };
    const ids = new Set<string>(site.timetableColumns?.[direction] ?? []);
    for (const id of freq.keys()) if (!stopsById.get(id)?.hidden) ids.add(id);
    return [...ids].sort((x, y) => pos(x) - pos(y));
  }, [site, trips, stopsById, direction]);

  // 表示するバス停(端末に保存)。未設定なら site.json の timetableColumns、それも無ければ全停留所
  const defaultShown = useMemo(() => {
    const configured = site.timetableColumns?.[direction];
    return configured?.length ? configured : candidates;
  }, [site, candidates, direction]);
  const storageKey = `${STORAGE_KEYS.timetableStops}_${direction}`;
  const [shownByDir, setShownByDir] = useState<Record<string, string[]>>({});
  const savedShown = useMemo(() => {
    try {
      const v = JSON.parse(readString(storageKey) ?? 'null');
      return Array.isArray(v) ? (v as string[]).filter((id) => candidates.includes(id)) : null;
    } catch {
      return null;
    }
  }, [storageKey, candidates]);
  const shown = shownByDir[direction] ?? (savedShown && savedShown.length ? savedShown : defaultShown);
  const columns = candidates.filter((id) => shown.includes(id));
  const [showStopPicker, setShowStopPicker] = useState(false);

  const toggleStop = (id: string) => {
    const next = shown.includes(id) ? shown.filter((x) => x !== id) : [...shown, id];
    if (next.length === 0) return; // 最低1か所は表示する
    setShownByDir((p) => ({ ...p, [direction]: next }));
    writeString(storageKey, JSON.stringify(next));
  };
  const resetStops = () => {
    setShownByDir((p) => ({ ...p, [direction]: defaultShown }));
    writeString(storageKey, JSON.stringify(defaultShown));
  };

  const rows = useMemo(() => {
    const list = trips
      .filter((t) => t.direction === direction && tripRuns(site, t, activeDate))
      .map((trip) => ({ trip, times: tripTimes(site, trip, activeDate) }));
    // 並び順は、いちばん多くの便が停まる列の時刻を基準にする
    const counts = columns.map((c) => list.filter((r) => cellTime(stopsById, c, r.times)).length);
    const keyCol = columns[counts.indexOf(Math.max(...counts, 0))];
    const key = (r: (typeof list)[number]) => toMin(cellTime(stopsById, keyCol, r.times)) ?? toMin(Object.values(r.times)[0]) ?? 9999;
    return list.sort((a, b) => key(a) - key(b));
  }, [trips, site, direction, activeDate, columns, stopsById]);

  const dayOptions: { value: DayType; label: string }[] = saturdayAsHoliday
    ? [{ value: 'weekday', label: DAY_LABEL.weekday }, { value: 'holiday', label: DAY_LABEL.holiday }]
    : [{ value: 'weekday', label: DAY_LABEL.weekday }, { value: 'saturday', label: DAY_LABEL.saturday }, { value: 'holiday', label: '日曜・祝日' }];

  const showRouteCol = routes.length > 1;
  const showOperatorCol = rows.some((r) => r.trip.operator);
  const colName = (id: string) => stopsById.get(id)?.shortName ?? stopsById.get(id)?.name ?? id;

  return (
    <div className="bg-slate-50 min-h-screen pb-12">
      <div className="sticky top-16 z-40 bg-white/95 backdrop-blur-md border-b border-slate-100 p-4 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">時刻表</h2>
        <div className="space-y-2">
          {site.directions.length > 1 && (
            <SegmentedToggle<string>
              value={direction}
              onChange={setDirection}
              options={site.directions.map((d) => ({ value: d.id, label: d.sub ? `${d.label}(${d.sub})` : d.label }))}
            />
          )}
          <SegmentedToggle<DayType> value={day} onChange={setDay} options={dayOptions} />
          {hasBreaks && (
            <SegmentedToggle<'term' | 'break'>
              value={inBreak ? 'break' : 'term'}
              onChange={(v) => setInBreak(v === 'break')}
              options={[{ value: 'term', label: '通常期' }, { value: 'break', label: '休業期' }]}
            />
          )}
        </div>
      </div>

      <main className="p-4 max-w-md mx-auto space-y-4">
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <button onClick={() => setShowStopPicker((p) => !p)} aria-expanded={showStopPicker} className="w-full min-h-11 py-2.5 px-4 flex items-center justify-between gap-2 cursor-pointer text-left">
            <span className="text-sm font-medium text-slate-900">表示するバス停</span>
            <span className="flex items-center gap-1.5 text-[12px] text-slate-500">
              {columns.length}/{candidates.length}か所
              <ChevronDown className={`w-4 h-4 transition-transform ${showStopPicker ? 'rotate-180' : ''}`} />
            </span>
          </button>
          {showStopPicker && (
            <div className="px-4 pb-3 space-y-2.5">
              <div className="flex flex-wrap gap-1.5">
                {candidates.map((id) => (
                  <button
                    key={id}
                    onClick={() => toggleStop(id)}
                    aria-pressed={shown.includes(id)}
                    className={`min-h-11 px-4 rounded-full text-[13px] transition-colors cursor-pointer ${shown.includes(id) ? 'bg-orange-700 text-white font-semibold' : 'bg-slate-100 text-slate-700'}`}
                  >
                    {colName(id)}
                  </button>
                ))}
              </div>
              <button onClick={resetStops} className="text-[13px] font-semibold text-orange-700 underline underline-offset-2 bg-transparent border-none px-0 min-h-11 cursor-pointer">
                初期の表示に戻す
              </button>
            </div>
          )}
        </div>

        <Card className="overflow-hidden border-slate-200 shadow-sm rounded-2xl bg-white">
          <div className="overflow-x-auto scrollbar-none">
            <table className="w-full text-sm text-center whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-500 text-xs border-b border-slate-200">
                <tr>
                  {showRouteCol && <th className="py-2.5 px-2 font-medium">種別</th>}
                  {showOperatorCol && <th className="py-2.5 px-2 font-medium">運行</th>}
                  {columns.map((c) => <th key={c} className="py-2.5 px-2 font-medium">{colName(c)}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + Number(showRouteCol) + Number(showOperatorCol)} className="py-8 text-xs text-slate-500 font-medium">対象の時刻表はありません。</td>
                  </tr>
                ) : (
                  rows.map(({ trip, times }) => {
                    const route = routes.find((r) => r.id === trip.route);
                    const op = trip.operator ? site.operators?.[trip.operator] : undefined;
                    return (
                      <tr key={trip.id} onClick={() => setSelected(trip)} className="transition-colors cursor-pointer hover:bg-orange-50/60 active:bg-orange-50 text-slate-700">
                        {showRouteCol && <td className="py-3 px-2">
                          {route && <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${routeBadge(route.color)}`}>{route.name}</span>}
                        </td>}
                        {showOperatorCol && <td className="py-3 px-2">
                          {op && <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-medium ${operatorBadge(op.color)}`}>{op.name}</span>}
                        </td>}
                        {columns.map((c, i) => {
                          const time = cellTime(stopsById, c, times);
                          const first = i === 0;
                          const cell = time ?? (
                            <>
                              <span aria-hidden="true">-</span>
                              <span className="sr-only">停車なし</span>
                            </>
                          );
                          return (
                            <td key={c} className={`${first ? 'p-0' : 'py-3 px-2'} ${i === 0 || i === columns.length - 1 ? 'font-medium text-slate-900' : 'text-xs font-medium text-slate-600'}`}>
                              {/* 行のクリックで開く。キーボード用に、最初の列だけはボタンにしている */}
                              {first ? (
                                <button
                                  type="button"
                                  aria-label={`${time ?? Object.values(times)[0]}発${route && routes.length > 1 ? ' ' + route.name : ''}の便。停車するバス停を表示`}
                                  className="w-full min-h-11 px-2 bg-transparent border-none cursor-pointer font-[inherit] text-[inherit] text-inherit"
                                >
                                  {cell}
                                </button>
                              ) : (
                                cell
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {rows.length > 0 && (
          <div className="flex flex-col items-center justify-center gap-1 pt-2 pb-6">
            <p className="text-xs text-slate-500 text-center flex items-center justify-center gap-1.5">
              <Info className="w-4 h-4 text-slate-500" />
              便をタップするとすべての停車バス停一覧を表示します
            </p>
          </div>
        )}
      </main>

      <TripDetailDialog trip={selected} date={activeDate} onClose={() => setSelected(null)} />
    </div>
  );
}
