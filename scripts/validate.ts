// 入力ミスの検出: npm run validate [dataディレクトリ(既定: public/data)]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { COLOR_NAMES } from '../src/lib/palette';
import { toMin } from '../src/lib/logic';
import type { Route, Site, Stop, Trip } from '../src/types';

/** dataディレクトリを検査して、問題の一覧を返す(空なら問題なし) */
export function validateDir(dirPath: string): string[] {
  const dir = resolve(dirPath);
  const errors: string[] = [];
  const err = (m: string) => errors.push(m);

  // JSONの読み込み。ファイルが無い・書き方(カンマ、引用符など)の誤りは、日本語で場所を伝える
  let broken = false;
  const load = (f: string): unknown => {
    let text: string;
    try {
      text = readFileSync(resolve(dir, f), 'utf8');
    } catch {
      err(`${f}: ファイルが見つかりません(${dir})`);
      broken = true;
      return undefined;
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      const m = /position (\d+)/.exec((e as Error).message);
      let where = '';
      if (m) {
        const upTo = text.slice(0, +m[1]);
        where = `(${upTo.split(/\r?\n/).length}行目あたり)`;
      }
      err(`${f}: JSONの書き方が正しくありません${where}。カンマの付け忘れ・付けすぎ、" の閉じ忘れを確認してください`);
      broken = true;
      return undefined;
    }
  };
  const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

  const siteRaw = load('site.json');
  const stopsRaw = load('stops.json');
  const routesRaw = load('routes.json');
  const tripsRaw = load('trips.json');
  if (broken) return errors;

  // ここで大まかな「形」を確かめる(以降の検査が落ちないように)
  if (!isObj(siteRaw)) err('site.json: { } で始まるオブジェクトではありません');
  else {
    if (!Array.isArray(siteRaw.directions) || siteRaw.directions.length === 0) err('site.json: directions(方向の一覧)がありません');
  }
  for (const [name, v] of [['stops.json', stopsRaw], ['routes.json', routesRaw], ['trips.json', tripsRaw]] as const) {
    if (!Array.isArray(v)) err(`${name}: [ ] で始まる一覧ではありません`);
    else if (v.length === 0) err(`${name}: 中身が空です`);
  }
  if (Array.isArray(routesRaw)) {
    for (const r of routesRaw) if (!isObj(r) || !isObj(r.stops)) err(`routes.json: 路線 "${isObj(r) ? String(r.id) : '?'}" に stops(方向ごとの停留所の並び)がありません`);
  }
  if (Array.isArray(tripsRaw)) {
    for (const t of tripsRaw) if (!isObj(t) || !isObj(t.times)) err(`trips.json: 便 "${isObj(t) ? String(t.id) : '?'}" に times(停留所ごとの時刻)がありません`);
  }
  if (errors.length) return errors;

  const site = siteRaw as Site;
  const stops = stopsRaw as Stop[];
  const routes = routesRaw as Route[];
  const trips = tripsRaw as Trip[];

  const stopIds = new Set(stops.map((s) => s.id));
  const dirIds = new Set((site.directions ?? []).map((d) => d.id));
  const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

  if (!site.name) err('site.json: name がありません');
  if (!dirIds.size) err('site.json: directions が空です');
  if (stopIds.size !== stops.length) err('stops.json: 停留所IDが重複しています');
  for (const s of stops) for (const a of s.alias ?? []) if (!stopIds.has(a)) err(`stops.json: ${s.id} の alias "${a}" が未定義です`);
  for (const [d, def] of Object.entries(site.defaults ?? {})) {
    if (!dirIds.has(d)) err(`site.json: defaults の方向 "${d}" が directions にありません`);
    for (const id of [def.from, def.to]) if (!stopIds.has(id)) err(`site.json: defaults.${d} の停留所 "${id}" が stops.json にありません`);
    const linked = trips.some((t) => {
      if (t.direction !== d) return false;
      const order = routes.find((r) => r.id === t.route)?.stops?.[d] ?? [];
      const resolve = (id: string) => [id, ...(stops.find((s) => s.id === id)?.alias ?? [])].find((x) => t.times?.[x] !== undefined);
      const f = resolve(def.from), to = resolve(def.to);
      return !!f && !!to && order.indexOf(f) >= 0 && order.indexOf(f) < order.indexOf(to);
    });
    if (stopIds.has(def.from) && stopIds.has(def.to) && !linked) {
      err(`site.json: defaults.${d}(${def.from} → ${def.to})を結ぶ便がありません。最初に選ばれる乗車地・降車地を、実際に便がある停留所に書き換えてください`);
    }
  }
  for (const [d, ids] of Object.entries(site.timetableColumns ?? {})) {
    for (const s of ids) if (!stopIds.has(s)) err(`site.json: timetableColumns.${d} に未定義の停留所 "${s}"`);
  }
  const colorOk = (c: string | undefined) => c === undefined || COLOR_NAMES.includes(c);
  for (const [id, op] of Object.entries(site.operators ?? {})) {
    if (!colorOk(op.color)) err(`site.json: 運行会社 ${id} の color "${op.color}" は使えません(${COLOR_NAMES.join(' / ')})`);
  }

  const routeIds = new Set(routes.map((r) => r.id));
  if (routeIds.size !== routes.length) err('routes.json: 路線IDが重複しています');
  for (const r of routes) {
    if (!colorOk(r.color)) err(`routes.json: 路線${r.id} の color "${r.color}" は使えません(${COLOR_NAMES.join(' / ')} のどれか。#1f4e79 のような色コードは使えません)`);
    for (const [d, list] of Object.entries(r.stops ?? {})) {
      if (!dirIds.has(d)) err(`routes.json: 路線${r.id} の方向 "${d}" が site.json の directions にありません`);
      for (const s of list) if (!stopIds.has(s)) err(`routes.json: 路線${r.id}/${d} に未定義の停留所 "${s}"`);
    }
  }
  for (const s of stops) for (const r of Object.keys(s.platforms ?? {})) if (!routeIds.has(r)) err(`stops.json: ${s.id} の platforms に未定義の路線 "${r}"`);

  const p = site.periods;
  if (p?.enabled) {
    let prevEnd = -1;
    for (const it of p.items ?? []) {
      const s = toMin(it.start), e = toMin(it.end);
      if (s == null || e == null) err(`site.json: ${it.id}${p.label} の時刻が HH:MM 形式ではありません`);
      else {
        if (s >= e) err(`site.json: ${it.id}${p.label} の開始が終了より遅いです`);
        if (s < prevEnd) err(`site.json: ${it.id}${p.label} が前の時限と重なっています`);
        prevEnd = e;
      }
    }
  }
  for (const b of site.calendar?.breaks ?? []) {
    if (!isDate(b.from) || !isDate(b.to) || b.from > b.to) err(`site.json: 休業期間 "${b.name}" の日付が不正です`);
  }
  for (const h of site.calendar?.holidays ?? []) if (!isDate(h)) err(`site.json: 祝日 "${h}" が YYYY-MM-DD 形式ではありません`);

  const checkTimes = (at: string, times: Record<string, string>, order: string[]) => {
    let prev = -1;
    for (const [s, v] of Object.entries(times)) {
      if (!order.includes(s)) err(`${at}: 停留所 "${s}" は路線の停留所リストに含まれません`);
      else if (toMin(v) == null) err(`${at}: ${s} の時刻 "${v}" が HH:MM 形式ではありません`);
    }
    for (const s of order) {
      const m = toMin(times[s]);
      if (m == null) continue;
      if (m < prev) err(`${at}: ${s} の時刻 ${times[s]} が前の停留所より早いです`);
      prev = m;
    }
    if (Object.keys(times).length < 2) err(`${at}: 時刻が2か所以上必要です`);
  };

  const ids = new Set<string>();
  for (const t of trips) {
    const at = `trips.json: ${t.id}`;
    if (ids.has(t.id)) err(`${at}: IDが重複しています`);
    ids.add(t.id);
    const route = routes.find((r) => r.id === t.route);
    if (!route) { err(`${at}: 路線 "${t.route}" が routes.json にありません`); continue; }
    const order = route.stops?.[t.direction];
    if (!order) { err(`${at}: 路線${t.route} に方向 "${t.direction}" の停留所リストがありません`); continue; }
    if (!['weekday', 'saturday', 'holiday', 'everyday', undefined].includes(t.days)) err(`${at}: days が不正です`);
    if (t.days === 'saturday' && site.calendar?.saturdayAs !== 'saturday') err(`${at}: days が saturday ですが、site.json の calendar.saturdayAs が "saturday" ではないため、この便は走りません`);
    if (!['run', 'suspend', 'only', undefined].includes(t.breaks)) err(`${at}: breaks が不正です`);
    if (t.operator && !site.operators?.[t.operator]) err(`${at}: operator "${t.operator}" が site.json の operators にありません`);
    for (const k of ['from', 'until'] as const) if (t[k] && !isDate(t[k]!)) err(`${at}: ${k} が YYYY-MM-DD 形式ではありません`);
    if (t.from && t.until && t.from > t.until) err(`${at}: from が until より後です`);
    checkTimes(at, t.times, order);
    if (t.breakTimes) checkTimes(`${at}(breakTimes)`, t.breakTimes, order);
  }

  return errors;
}

// コマンドとして実行されたときだけ、結果を表示して終了コードを返す
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = resolve(process.argv[2] ?? 'public/data');
  const errors = validateDir(dir);
  if (errors.length) {
    console.error(errors.map((e) => '  × ' + e).join('\n'));
    console.error(`\n${errors.length} 件の問題があります`);
    process.exit(1);
  }
  const n = (f: string) => (JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as unknown[]).length;
  console.log(`OK: 停留所${n('stops.json')} / 路線${n('routes.json')} / 便${n('trips.json')}`);
}
