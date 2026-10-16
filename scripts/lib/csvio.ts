// CSV ⇄ data/*.json の変換。形式の説明は docs/CSV_FORMAT.md
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, parse as parsePath } from 'node:path';
import { decodeCsv, normalizeDate, normalizeTime, parseCsv, toCsv } from './csv';
import type { BreaksBehavior, Route, Site, Stop, Trip, TripDays } from '../../src/types';

const DAYS_WORDS: Record<string, TripDays> = {
  weekday: 'weekday', 平日: 'weekday',
  holiday: 'holiday', 土日祝: 'holiday', 日祝: 'holiday', 休日: 'holiday', 土日: 'holiday',
  saturday: 'saturday', 土曜: 'saturday', 土: 'saturday',
  everyday: 'everyday', 毎日: 'everyday', 全日: 'everyday',
};
const BREAKS_WORDS: Record<string, BreaksBehavior> = {
  run: 'run', 通常: 'run',
  suspend: 'suspend', 運休: 'suspend',
  only: 'only', 休業中のみ: 'only', 休業期のみ: 'only',
};
// 時刻のセルが「停まらない」を表す記号
const SKIP_CELLS = new Set(['', '|', '-', '–', '—', '‐', 'ー', '↓', '・', '||']);

const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;
const writeJson = (file: string, v: unknown) => writeFileSync(file, JSON.stringify(v, null, 1) + '\n', 'utf8');

export interface ImportResult {
  files: number;
  trips: number;
  newStops: string[];
  newRoutes: string[];
  /** どの路線にも出てこない停留所(古いデータの名残。stops.json から消してよい) */
  unusedStops: string[];
}

/** timetable-csv/*.csv → stops.json / routes.json / trips.json(site.json は変更しない) */
export function importCsv(csvDir: string, dataDir: string): ImportResult {
  const errors: string[] = [];
  const site = readJson<Site>(join(dataDir, 'site.json'));
  const stops: Stop[] = existsSync(join(dataDir, 'stops.json')) ? readJson<Stop[]>(join(dataDir, 'stops.json')) : [];
  const routes: Route[] = existsSync(join(dataDir, 'routes.json')) ? readJson<Route[]>(join(dataDir, 'routes.json')) : [];

  const stopKey = new Map<string, Stop>();
  const indexStop = (s: Stop) => { for (const k of [s.id, s.name, s.shortName]) if (k) stopKey.set(k, s); };
  stops.forEach(indexStop);
  const newStops: string[] = [];
  const resolveStop = (name: string): Stop => {
    let s = stopKey.get(name);
    if (!s) {
      s = { id: name, name };
      stops.push(s); indexStop(s); newStops.push(name);
    }
    return s;
  };

  const resolveDirection = (v: string) =>
    site.directions.find((d) => d.id === v || d.label === v || `${d.label}${d.sub ?? ''}` === v || d.sub === v)?.id;

  const newRoutes: string[] = [];
  const resolveRoute = (v: string): Route => {
    let r = routes.find((x) => x.id === v || x.name === v);
    if (!r) {
      r = { id: v, name: v, color: 'slate', stops: {} };
      routes.push(r); newRoutes.push(v);
    }
    return r;
  };

  const files = existsSync(csvDir) ? readdirSync(csvDir).filter((f) => /\.csv$/i.test(f)).sort() : [];
  if (!files.length) errors.push(`${csvDir} に .csv ファイルがありません`);

  const trips: Trip[] = [];
  // (路線,方向)ごとに、CSV内の停留所の並びを集めて統合する
  const orders = new Map<string, { route: Route; dir: string; lists: string[][] }>();

  for (const file of files) {
    const at = (row: number, extra = '') => `${file}${row ? ` ${row}行目` : ''}${extra}`;
    const raw = parseCsv(decodeCsv(readFileSync(join(csvDir, file))));
    const rows = raw
      .map((r, i) => ({ cells: r.map((c) => c.trim()), no: i + 1 }))
      .filter((r) => r.cells.some((c) => c !== ''));

    const meta: Record<string, string> = {};
    const perTrip: Record<string, string[]> = {};
    let header: { cells: string[]; no: number } | null = null;
    const body: { cells: string[]; no: number }[] = [];
    for (const r of rows) {
      const head = r.cells[0] ?? '';
      if (!header && head.startsWith('#')) meta[head.slice(1).trim().toLowerCase()] = r.cells[1] ?? '';
      else if (!header && head.startsWith('@')) perTrip[head.slice(1).trim().toLowerCase()] = r.cells.slice(1);
      else if (!header) header = r;
      else body.push(r);
    }
    if (!header) { errors.push(`${file}: 時刻の表がありません`); continue; }

    if (!meta.route) errors.push(`${at(0)}: #route の行がありません(例: #route,A)`);
    if (!meta.direction) errors.push(`${at(0)}: #direction の行がありません(例: #direction,down)`);
    if (!meta.route || !meta.direction) continue;

    const route = resolveRoute(meta.route);
    const dir = resolveDirection(meta.direction);
    if (!dir) {
      errors.push(`${at(0)}: #direction "${meta.direction}" が site.json の directions にありません(${site.directions.map((d) => d.id).join(' / ')})`);
      continue;
    }
    const days = meta.days ? DAYS_WORDS[meta.days] : 'everyday';
    if (!days) errors.push(`${at(0)}: #days "${meta.days}" が分かりません(平日 / 土日祝 / 土曜 / 毎日)`);
    const breaks = meta.breaks ? BREAKS_WORDS[meta.breaks] : undefined;
    if (meta.breaks && !breaks) errors.push(`${at(0)}: #breaks "${meta.breaks}" が分かりません(通常 / 運休 / 休業中のみ)`);
    const dates: Record<'from' | 'until', string | undefined> = { from: undefined, until: undefined };
    for (const k of ['from', 'until'] as const) {
      if (!meta[k]) continue;
      const d = normalizeDate(meta[k]);
      if (!d) errors.push(`${at(0)}: #${k} "${meta[k]}" が日付(2026-10-01)ではありません`);
      else dates[k] = d;
    }

    const nCols = Math.max(header.cells.length, ...body.map((r) => r.cells.length)) - 1;
    const colTimes: Record<string, string>[] = Array.from({ length: nCols }, () => ({}));
    const fileStops: string[] = [];
    for (const r of body) {
      const stop = resolveStop(r.cells[0]);
      if (fileStops.includes(stop.id)) { errors.push(`${at(r.no)}: 停留所 "${r.cells[0]}" が2回出てきます`); continue; }
      fileStops.push(stop.id);
      for (let j = 0; j < nCols; j++) {
        const cell = r.cells[j + 1] ?? '';
        if (SKIP_CELLS.has(cell)) continue;
        const t = normalizeTime(cell);
        if (!t) { errors.push(`${at(r.no)}: ${j + 2}列目 "${cell}" が時刻(7:05 など)ではありません`); continue; }
        colTimes[j][stop.id] = t;
      }
    }

    const ok = key(route.id, dir);
    const slot = orders.get(ok) ?? { route, dir, lists: [] };
    slot.lists.push(fileStops);
    orders.set(ok, slot);

    const base = parsePath(file).name;
    colTimes.forEach((times, j) => {
      if (Object.keys(times).length === 0) return; // 空の列は無視
      const extra: Partial<Trip> = {};
      if (days && days !== 'everyday') extra.days = days;
      if (breaks && breaks !== 'run') extra.breaks = breaks;
      if (dates.from) extra.from = dates.from;
      if (dates.until) extra.until = dates.until;
      const op = perTrip.operator?.[j];
      if (op) extra.operator = op;
      const label = perTrip.label?.[j];
      if (label) extra.label = label;
      trips.push({ id: `${base}-${String(j + 1).padStart(2, '0')}`, route: route.id, direction: dir, ...extra, times });
    });
  }

  // 路線ごとの停留所の並び: 複数のCSVを、順番を守ったまま統合する
  for (const { route, dir, lists } of orders.values()) {
    const merged: string[] = [];
    for (const list of lists) {
      let anchor = -1; // 直前に見つけた停留所の、merged内の位置
      for (const id of list) {
        const at = merged.indexOf(id);
        if (at >= 0) {
          if (at < anchor) errors.push(`路線${route.id}/${dir}: 停留所 "${stops.find((s) => s.id === id)?.name}" の並び順が、CSVどうしで食い違っています`);
          anchor = Math.max(anchor, at);
        } else {
          merged.splice(anchor + 1, 0, id);
          anchor += 1;
        }
      }
    }
    route.stops[dir] = merged;
  }

  // CSV に無い(便が1つも無い)路線・方向の停留所リストは、古いデータの名残なので外す
  for (const r of routes) {
    for (const d of Object.keys(r.stops)) if (!orders.has(key(r.id, d))) delete r.stops[d];
  }

  if (errors.length) throw new ImportError(errors);

  writeJson(join(dataDir, 'stops.json'), stops);
  writeJson(join(dataDir, 'routes.json'), routes);
  writeJson(join(dataDir, 'trips.json'), trips);
  const inRoutes = new Set(routes.flatMap((r) => Object.values(r.stops).flat()));
  const aliased = new Set(stops.flatMap((s) => s.alias ?? []));
  const unusedStops = stops
    .filter((s) => !inRoutes.has(s.id) && !s.alias?.some((a) => inRoutes.has(a)) && !(s.hidden && aliased.has(s.id)))
    .map((s) => s.name);
  return { files: files.length, trips: trips.length, newStops, newRoutes, unusedStops };
}

const key = (route: string, dir: string) => `${route}\u0000${dir}`;

export class ImportError extends Error {
  constructor(public problems: string[]) {
    super(problems.join('\n'));
  }
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, '-');

/** stops/routes/trips.json → timetable-csv/*.csv(路線・方向・曜日などが同じ便ごとに1ファイル) */
export function exportCsv(dataDir: string, csvDir: string): { files: number; skipped: string[] } {
  const stops = readJson<Stop[]>(join(dataDir, 'stops.json'));
  const routes = readJson<Route[]>(join(dataDir, 'routes.json'));
  const trips = readJson<Trip[]>(join(dataDir, 'trips.json'));
  const nameOf = new Map(stops.map((s) => [s.id, s.name]));
  mkdirSync(csvDir, { recursive: true });

  const skipped: string[] = [];
  const groups = new Map<string, Trip[]>();
  for (const t of trips) {
    if (t.breakTimes) { skipped.push(`${t.id}(breakTimes は CSV では表せません)`); continue; }
    const k = JSON.stringify([t.route, t.direction, t.days ?? 'everyday', t.breaks ?? 'run', t.from ?? '', t.until ?? '']);
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }

  const used = new Set<string>();
  for (const list of groups.values()) {
    const t0 = list[0];
    const route = routes.find((r) => r.id === t0.route)!;
    const order = (route.stops[t0.direction] ?? []).filter((id) => list.some((t) => id in t.times));
    const meta: string[][] = [['#route', route.id], ['#direction', t0.direction]];
    if (t0.days && t0.days !== 'everyday') meta.push(['#days', t0.days]);
    if (t0.breaks && t0.breaks !== 'run') meta.push(['#breaks', t0.breaks]);
    if (t0.from) meta.push(['#from', t0.from]);
    if (t0.until) meta.push(['#until', t0.until]);
    if (list.some((t) => t.operator)) meta.push(['@operator', ...list.map((t) => t.operator ?? '')]);
    if (list.some((t) => t.label)) meta.push(['@label', ...list.map((t) => t.label ?? '')]);
    const header = ['停留所', ...list.map((_, i) => String(i + 1))];
    const body = order.map((id) => [nameOf.get(id) ?? id, ...list.map((t) => t.times[id] ?? '')]);

    let base = safeName([route.id, t0.direction, t0.days ?? 'everyday', t0.breaks && t0.breaks !== 'run' ? t0.breaks : '', t0.from ? `from${t0.from}` : '', t0.until ? `until${t0.until}` : ''].filter(Boolean).join('_'));
    let name = base, n = 2;
    while (used.has(name)) name = `${base}-${n++}`;
    used.add(name);
    writeFileSync(join(csvDir, `${name}.csv`), toCsv([...meta, header, ...body]), 'utf8');
  }
  return { files: groups.size, skipped };
}
