import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { availableStops, carryoverHits, clockNote, connects, directionFor, filterByPeriod, filterNow, findTrips, nextOperatingDay, tripRuns } from '../src/lib/logic';
import { parseMarkdown, safeHref } from '../src/lib/markdown';
import type { Route, Site, Stop, TimetableData, Trip } from '../src/types';

const dir = resolve(process.argv[2] ?? 'examples/chitose');
const L = <T>(f: string): T => JSON.parse(readFileSync(resolve(dir, f), 'utf8'));
const data: TimetableData = { site: L<Site>('site.json'), stops: L<Stop[]>('stops.json'), routes: L<Route[]>('routes.json'), trips: L<Trip[]>('trips.json') };

const wd = new Date(2026, 10, 18);   // 水曜(通常期)
const sun = new Date(2026, 10, 22);  // 日曜
const brk = new Date(2026, 7, 12);   // 夏季の休業期の水曜

// 平日: 千歳駅前→本部棟は行き方向の便がある
const up = findTrips(data, wd, 'chitose_st', 'univ_main', 'to_univ');
assert.ok(up.length > 10, '平日の行きの便がある');
assert.ok(up.every((h) => h.dep < h.arr));

// 1限(09:00開始)に間に合う便は、09:00までに本部棟へ着く
const p1 = filterByPeriod(data.site, up, 'to_univ', '1');
assert.ok(p1.length > 0 && p1.every((h) => h.arr <= 9 * 60));
assert.ok(p1[0].arr >= p1[p1.length - 1].arr, '遅い順');

// 帰り: 5限終了(18:15)後に乗れる便
const down = findTrips(data, wd, 'univ_main', 'chitose_st', 'to_city');
const p5 = filterByPeriod(data.site, down, 'to_city', '5');
assert.ok(p5.length > 0 && p5.every((h) => h.dep >= 18 * 60 + 15));
assert.ok(p5[0].dep <= p5[p5.length - 1].dep, '早い順');

// 現在時刻以降のフィルタ
assert.ok(filterNow(up, 8 * 60).every((h) => h.dep >= 8 * 60));

// 休業期: 通常期のみの便(breaks:suspend)は走らず、休業期専用便(only)が走る
const suspended = data.trips.find((t) => t.breaks === 'suspend' && t.days === 'weekday' && !t.until && !t.from);
if (suspended) {
  assert.equal(tripRuns(data.site, suspended, wd), true);
  assert.equal(tripRuns(data.site, suspended, brk), false);
}
const onlyBreak = data.trips.filter((t) => t.breaks === 'only' && t.days === 'weekday');
assert.ok(onlyBreak.length > 0);
assert.ok(onlyBreak.every((t) => tripRuns(data.site, t, brk) && !tripRuns(data.site, t, wd)));

// 土曜は日祝と同じダイヤ(saturdayAs: holiday)
const sat = new Date(2026, 10, 21);
assert.ok(findTrips(data, sat, 'chitose_st', 'univ_main').length === findTrips(data, sun, 'chitose_st', 'univ_main').length);

// 改正前の便(until)は改正後に走らない
const old = data.trips.find((t) => t.until);
if (old) assert.equal(tripRuns(data.site, old, wd), false);

// 方向の推定・選べる停留所
assert.equal(directionFor(data, 'chitose_st', 'univ_main'), 'to_univ');
assert.equal(directionFor(data, 'univ_main', 'chitose_st'), 'to_city');
const names = availableStops(data, wd).map((s) => s.id);
assert.ok(names.includes('chitose_st') && !names.includes('minami_chitose_kitaguchi'), 'hidden は選択肢に出ない');

console.log('ok');

// --- 深夜(0時またぎ)・区間の有無・運行終了のあと ---
assert.equal(clockNote('24:10'), '翌0:10');
assert.equal(clockNote('23:59'), null);
// 日曜の0:00は、土曜(休日ダイヤ)の24:00発の便(千歳駅前→長都)がこれから出る。運行日の切り替え(04:00)後は出ない。
const sunEarly = new Date(2026, 10, 22, 0, 0);
const carry = carryoverHits(data, sunEarly, 'chitose_st', 'osatsu_st', 'to_city');
assert.ok(carry.length > 0 && carry.every((h) => h.dep >= 1440), '前日の24時台の便が拾える');
assert.equal(carryoverHits(data, new Date(2026, 10, 22, 0, 5), 'chitose_st', 'osatsu_st', 'to_city').length, 0, '24:00発は0:05には出発済み');
assert.equal(carryoverHits(data, new Date(2026, 10, 22, 5, 0), 'chitose_st', 'osatsu_st', 'to_city').length, 0);
assert.ok(connects(data, 'chitose_st', 'univ_main'));
assert.ok(!connects(data, 'univ_main', 'chitose_st', 'to_univ'), '方向が逆の区間は結ばれていない');
assert.ok(!connects(data, 'univ_main', 'univ_main'));

// --- sample(時限が7つある汎用サンプル) ---
const S = <T>(f: string): T => JSON.parse(readFileSync(resolve('examples/sample', f), 'utf8'));
const sample: TimetableData = { site: S<Site>('site.json'), stops: S<Stop[]>('stops.json'), routes: S<Route[]>('routes.json'), trips: S<Trip[]>('trips.json') };
const sWd = new Date(2026, 10, 18);
const back = findTrips(sample, sWd, 'depot', 'station', 'up');
const p7 = filterByPeriod(sample.site, back, 'up', '7');
assert.ok(p7.length > 0 && p7.every((h) => h.dep >= 21 * 60 + 40 + (sample.site.arrivalBufferMin ?? 0)), '7限終了後に乗れる便がある');
const sSat = new Date(2026, 10, 21);
assert.ok(findTrips(sample, sSat, 'station', 'depot').length > 0, '土曜は既定で休日ダイヤ');
assert.equal(findTrips(sample, sSat, 'station', 'depot').length, findTrips(sample, new Date(2026, 10, 22), 'station', 'depot').length);
const indep: TimetableData = { ...sample, site: { ...sample.site, calendar: { ...sample.site.calendar, saturdayAs: 'saturday' } } };
assert.equal(findTrips(indep, sSat, 'station', 'depot').length, 0, 'saturdayAs: saturday なら土曜は独立(休日便は走らない)');
// 1日だけの便(from と until が同じ日): その日だけ走り、前日・翌日は走らない
const oneDay: Trip = { id: 'event', route: 'A', direction: 'down', from: '2026-11-03', until: '2026-11-03', times: { station: '09:00', depot: '09:18' } };
assert.equal(tripRuns(sample.site, oneDay, new Date(2026, 10, 3)), true);
assert.equal(tripRuns(sample.site, oneDay, new Date(2026, 10, 2)), false);
assert.equal(tripRuns(sample.site, oneDay, new Date(2026, 10, 4)), false);
const nextDay = nextOperatingDay(sample, new Date(2026, 10, 22), 'station', 'depot', 'down');
// 11/23(月)はサンプルの祝日なので、休日ダイヤの始発(09:00)
assert.ok(nextDay && nextDay.date.getDate() === 23 && nextDay.hit.times.station === '09:00', '翌運行日の始発');
console.log('sample ok');

// --- validate: よくある入力ミスを日本語で検出する ---
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateDir } from './validate';

const vtmp = mkdtempSync(join(tmpdir(), 'busboard-validate-'));
const fresh = (name: string, patch?: (files: Record<string, string>) => void) => {
  const d = join(vtmp, name);
  mkdirSync(d);
  const files: Record<string, string> = {};
  for (const f of ['site.json', 'stops.json', 'routes.json', 'trips.json']) files[f] = readFileSync(resolve('examples/sample', f), 'utf8');
  patch?.(files);
  for (const [f, text] of Object.entries(files)) writeFileSync(join(d, f), text, 'utf8');
  return d;
};
try {
  assert.deepEqual(validateDir(fresh('ok')), []);
  const hex = validateDir(fresh('hex', (f) => { f['routes.json'] = f['routes.json'].replace('"blue"', '"#1f4e79"'); }));
  assert.ok(hex.some((e) => e.includes('#1f4e79') && e.includes('blue')), '色コードは使えないと伝える');
  const broken = validateDir(fresh('broken', (f) => { f['site.json'] = f['site.json'].replace('"name"', '"name",,'); }));
  assert.ok(broken.length === 1 && broken[0].includes('site.json') && broken[0].includes('JSONの書き方'), '壊れたJSONは日本語で');
  const noDir = validateDir(fresh('nodir', (f) => { f['site.json'] = JSON.stringify({ name: 'x' }); }));
  assert.ok(noDir.some((e) => e.includes('directions')), '必須項目の欠けで落ちない');
  const unreachable = validateDir(fresh('defaults', (f) => {
    const site = JSON.parse(f['site.json']);
    site.defaults.down = { from: 'depot', to: 'station' }; // 下りの向きでは営業所前→駅前の便は無い
    f['site.json'] = JSON.stringify(site);
  }));
  assert.ok(unreachable.some((e) => e.includes('defaults.down') && e.includes('結ぶ便がありません')), '既定の区間に便が無いことを伝える');
  const missing = validateDir(join(vtmp, 'nothing'));
  assert.ok(missing.some((e) => e.includes('見つかりません')));
  const noTimes = validateDir(fresh('notimes', (f) => { f['trips.json'] = '[{"id":"x","route":"A","direction":"down"}]'; }));
  assert.ok(noTimes.some((e) => e.includes('times')), 'times が無くても落ちない');
} finally {
  rmSync(vtmp, { recursive: true, force: true });
}
console.log('validate ok');

// --- 案内ページ(about.md)の Markdown: 決まった書き方だけを読み、HTMLやあぶない書き方は文字として出す ---
const md = parseMarkdown(['# 見出し', '', '本文 **太字** と [リンク](https://example.com/)', '2行目', '', '- 項目A', '- 項目B', '', '1. 手順1', '2. 手順2', '', '---'].join('\n'));
assert.deepEqual(md.map((b) => b.type), ['heading', 'paragraph', 'ul', 'ol', 'hr']);
const para = md[1];
assert.ok(para.type === 'paragraph' && para.lines.length === 2, '行の改行を残す');
assert.ok(para.type === 'paragraph' && para.lines[0].some((i) => i.type === 'bold') && para.lines[0].some((i) => i.type === 'link'));
assert.equal(safeHref('https://example.com'), 'https://example.com');
assert.equal(safeHref('tel:0123-45-6789'), 'tel:0123-45-6789');
assert.equal(safeHref('javascript:alert(1)'), null);
assert.equal(safeHref('data:text/html,x'), null);
const evil = parseMarkdown('[押す](javascript:alert(1)) <script>alert(1)</script>');
assert.ok(evil[0].type === 'paragraph' && !evil[0].lines[0].some((i) => i.type === 'link'), 'あぶないリンクはリンクにしない');
assert.ok(evil[0].type === 'paragraph' && evil[0].lines[0].some((i) => i.type === 'text' && i.text.includes('<script>')), 'HTMLは文字として残る(動かさない)');
console.log('markdown ok');
