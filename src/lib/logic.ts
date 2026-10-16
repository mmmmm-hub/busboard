// 時刻表の判定ロジック。DOMに依存しない純関数(Node・ブラウザ両方で動く)。

import type { DayType, Hit, PeriodMode, Site, Stop, TimetableData, Trip } from '../types';

/** "HH:MM" → 分。"24:10" のような深夜の表記も扱える */
export function toMin(s: string | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s ?? '');
  return m ? +m[1] * 60 + +m[2] : null;
}

export function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isInBreak(site: Site, d: Date) {
  const k = ymd(d);
  return (site.calendar?.breaks ?? []).find((b) => b.from <= k && k <= b.to) ?? null;
}

export function dayType(site: Site, d: Date): DayType {
  const w = d.getDay();
  if (w === 0 || (site.calendar?.holidays ?? []).includes(ymd(d))) return 'holiday';
  if (w === 6) return site.calendar?.saturdayAs === 'saturday' ? 'saturday' : 'holiday';
  return 'weekday';
}

export function tripRuns(site: Site, trip: Trip, d: Date): boolean {
  const k = ymd(d);
  if (trip.from && k < trip.from) return false;
  if (trip.until && k > trip.until) return false;
  const days = trip.days ?? 'everyday';
  if (days !== 'everyday' && days !== dayType(site, d)) return false;
  const inBreak = !!isInBreak(site, d);
  const b = trip.breaks ?? 'run';
  if (b === 'suspend' && inBreak) return false;
  if (b === 'only' && !inBreak) return false;
  return true;
}

/** その日に使う時刻(休業中専用の時刻があればそちら) */
export function tripTimes(site: Site, trip: Trip, d: Date): Record<string, string> {
  return trip.breakTimes && isInBreak(site, d) ? trip.breakTimes : trip.times;
}

/** 選択した停留所IDを、その便の時刻に含まれる実際の停留所IDに解決する(alias対応) */
export function resolveStop(stopsById: Map<string, Stop>, id: string, times: Record<string, string>): string | null {
  if (times[id]) return id;
  for (const a of stopsById.get(id)?.alias ?? []) if (times[a]) return a;
  return null;
}

export function stopMap(stops: Stop[]): Map<string, Stop> {
  return new Map(stops.map((s) => [s.id, s]));
}

/** 乗車地→降車地を結ぶ便を、その日の分だけ出発順に列挙する */
export function findTrips(
  data: TimetableData,
  d: Date,
  fromId: string,
  toId: string,
  directionId?: string,
): Hit[] {
  const stops = stopMap(data.stops);
  const out: Hit[] = [];
  for (const trip of data.trips) {
    if (directionId && trip.direction !== directionId) continue;
    if (!tripRuns(data.site, trip, d)) continue;
    const route = data.routes.find((r) => r.id === trip.route);
    if (!route) continue;
    const times = tripTimes(data.site, trip, d);
    const f = resolveStop(stops, fromId, times);
    const t = resolveStop(stops, toId, times);
    if (!f || !t) continue;
    const order = route.stops[trip.direction] ?? [];
    const fi = order.indexOf(f), ti = order.indexOf(t);
    const dep = toMin(times[f]), arr = toMin(times[t]);
    if (fi < 0 || ti < 0 || fi >= ti || dep == null || arr == null || dep >= arr) continue;
    out.push({ trip, route, times, fromId: f, toId: t, dep, arr });
  }
  return out.sort((a, b) => a.dep - b.dep || a.arr - b.arr);
}

export function periodModeOf(site: Site, directionId: string): PeriodMode {
  return site.directions.find((x) => x.id === directionId)?.periodMode ?? 'arrive_before_start';
}

/**
 * 時限に合う便。
 * 開始に間に合う便(arrive_before_start)は遅い順(ギリギリの便が先頭)、
 * 終了後に乗れる便(depart_after_end)は早い順で返す。
 */
export function filterByPeriod(site: Site, hits: Hit[], directionId: string, periodId: string): Hit[] {
  const p = site.periods?.items.find((x) => String(x.id) === periodId);
  if (!p) return [];
  const buf = site.arrivalBufferMin ?? 0;
  if (periodModeOf(site, directionId) === 'depart_after_end') {
    const end = toMin(p.end) ?? 0;
    return hits.filter((h) => h.dep >= end + buf);
  }
  const start = toMin(p.start) ?? 0;
  return hits.filter((h) => h.arr <= start - buf).reverse();
}

/** 現在時刻以降の便 */
export function filterNow(hits: Hit[], nowMin: number): Hit[] {
  return hits.filter((h) => h.dep >= nowMin);
}

/** 直前に出た便(現在時刻より前で、いちばん新しいもの) */
export function previousHit(hits: Hit[], nowMin: number): Hit | null {
  const past = hits.filter((h) => h.dep < nowMin);
  return past.length ? past[past.length - 1] : null;
}

/** 時刻表タブの1行ぶん: 列(停留所)に対応する時刻(aliasがあれば代替) */
export function cellTime(stopsById: Map<string, Stop>, stopId: string, times: Record<string, string>): string | undefined {
  const id = resolveStop(stopsById, stopId, times);
  return id ? times[id] : undefined;
}

/** 乗車地→降車地が(日付を問わず)結ばれている方向。どれにも無ければ null */
export function directionFor(data: TimetableData, fromId: string, toId: string): string | null {
  const stops = stopMap(data.stops);
  for (const dir of data.site.directions) {
    for (const trip of data.trips) {
      if (trip.direction !== dir.id) continue;
      const route = data.routes.find((r) => r.id === trip.route);
      const order = route?.stops[dir.id] ?? [];
      const f = resolveStop(stops, fromId, trip.times);
      const t = resolveStop(stops, toId, trip.times);
      if (f && t && order.indexOf(f) >= 0 && order.indexOf(f) < order.indexOf(t)) return dir.id;
    }
  }
  return null;
}

/** その日に選べる停留所(その日に走る便のどれかが停まるもの)。hidden は除く */
export function availableStops(data: TimetableData, d: Date): Stop[] {
  const present = new Set<string>();
  for (const trip of data.trips) {
    if (!tripRuns(data.site, trip, d)) continue;
    for (const id of Object.keys(tripTimes(data.site, trip, d))) present.add(id);
  }
  return data.stops.filter((s) => !s.hidden && (present.has(s.id) || (s.alias ?? []).some((a) => present.has(a))));
}

// ---- 深夜(0時またぎ)・運行終了・区間の有無 ----

/** 運行日が切り替わる時刻(分)。これより前は「前日のダイヤの続き」を見る。既定は 04:00 */
export function serviceDayStartMin(site: Site): number {
  return toMin(site.serviceDayStart) ?? 4 * 60;
}

/**
 * 0時〜運行日の切り替え前に、前日のダイヤでまだ走っている便(24:10 発など)。
 * 発車は「前日の0時からの分」なので、今の時刻に1440を足して比べる。
 */
export function carryoverHits(data: TimetableData, now: Date, fromId: string, toId: string, directionId?: string): Hit[] {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (nowMin >= serviceDayStartMin(data.site)) return [];
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return findTrips(data, yesterday, fromId, toId, directionId).filter((h) => h.dep >= nowMin + 1440);
}

/** その区間を結ぶ便が、日付を問わず1つでもあるか(方向を指定すればその方向だけ) */
export function connects(data: TimetableData, fromId: string, toId: string, directionId?: string): boolean {
  const stops = stopMap(data.stops);
  for (const trip of data.trips) {
    if (directionId && trip.direction !== directionId) continue;
    const order = data.routes.find((r) => r.id === trip.route)?.stops[trip.direction] ?? [];
    const f = resolveStop(stops, fromId, trip.times) ?? resolveStop(stops, fromId, trip.breakTimes ?? {});
    const t = resolveStop(stops, toId, trip.times) ?? resolveStop(stops, toId, trip.breakTimes ?? {});
    if (f && t && order.indexOf(f) >= 0 && order.indexOf(f) < order.indexOf(t)) return true;
  }
  return false;
}

/** 指定日の翌日以降(最大 days 日先)で、最初に便がある日と、その始発 */
export function nextOperatingDay(
  data: TimetableData,
  date: Date,
  fromId: string,
  toId: string,
  directionId?: string,
  days = 14,
): { date: Date; hit: Hit } | null {
  for (let i = 1; i <= days; i++) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + i);
    const hits = findTrips(data, d, fromId, toId, directionId);
    if (hits.length) return { date: d, hit: hits[0] };
  }
  return null;
}

/** "24:10" のような24時以降の表記に添える「翌0:10」。通常の時刻は null */
export function clockNote(t: string | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t ?? '');
  if (!m || +m[1] < 24) return null;
  return `翌${+m[1] - 24}:${m[2]}`;
}
