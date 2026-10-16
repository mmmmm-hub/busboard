// CSV の取り込み・書き出しのテスト
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { normalizeDate, normalizeTime, parseCsv, toCsv } from './lib/csv';
import { ImportError, exportCsv, importCsv } from './lib/csvio';
import type { Trip } from '../src/types';

const CRLF = '\r\n';
const lines = (...l: string[]) => l.join(CRLF) + CRLF;

// 部品: 時刻・日付・CSVの読み書き
assert.equal(normalizeTime('7:05'), '07:05');
assert.equal(normalizeTime('07:05:00'), '07:05');
assert.equal(normalizeTime('７：５'), '07:05');
assert.equal(normalizeTime('7時5分'), '07:05');
assert.equal(normalizeTime('24:10'), '24:10');
assert.equal(normalizeTime('abc'), null);
assert.equal(normalizeDate('2026/10/1'), '2026-10-01');
assert.equal(normalizeDate('2026-02-30'), null);
assert.deepEqual(parseCsv(lines('a,"b,c"', '"x""y",z')), [['a', 'b,c'], ['x"y', 'z']]);
assert.deepEqual(parseCsv(toCsv([['日本語', 'a,b']])), [['日本語', 'a,b']]);

const SAMPLE = resolve('examples/sample-univ');
const sampleTrips = JSON.parse(readFileSync(join(SAMPLE, 'trips.json'), 'utf8')) as Trip[];
const tmp = mkdtempSync(join(tmpdir(), 'busboard-csv-'));
const readTrips = (dir: string) => JSON.parse(readFileSync(join(dir, 'trips.json'), 'utf8')) as Trip[];

try {
  const dataDir = join(tmp, 'data');
  mkdirSync(dataDir);
  for (const f of ['site.json', 'stops.json', 'routes.json']) cpSync(join(SAMPLE, f), join(dataDir, f));

  // 往復: sample-univ → CSV → 取り込み で、便の内容(ID以外)が変わらない
  const csvDir = join(tmp, 'csv');
  const out = exportCsv(SAMPLE, csvDir);
  assert.ok(out.files >= 3 && out.skipped.length === 0);
  const r = importCsv(csvDir, dataDir);
  assert.equal(r.trips, sampleTrips.length);
  assert.equal(r.newStops.length + r.newRoutes.length, 0, '既存の停留所・路線は名前で突き合わせる');
  const norm = (ts: Trip[]) => ts.map((t) => JSON.stringify({ ...t, id: undefined })).sort();
  assert.deepEqual(norm(readTrips(dataDir)), norm(sampleTrips));

  // 手で書いたCSV: 秒つき時刻・日本語の曜日名・方向名・空のセル(停まらない)
  const handDir = join(tmp, 'hand');
  mkdirSync(handDir);
  writeFileSync(join(handDir, 'a.csv'), lines('#route,A', '#direction,行き', '#days,平日', '停留所,1,2', '駅前,7:00:00,7:20', '大学本部棟,7:18,'), 'utf8');
  importCsv(handDir, dataDir);
  const t2 = readTrips(dataDir);
  assert.equal(t2.length, 2);
  assert.deepEqual(t2[0], { id: 'a-01', route: 'A', direction: 'to_campus', days: 'weekday', times: { station: '07:00', main: '07:18' } });
  assert.equal(t2[1].times.station, '07:20');
  assert.equal(t2[1].times.main, undefined, '空のセルは停まらない扱い');

  // 新しい停留所は名前でそのまま追加され、複数のCSVの停留所の並びは統合される
  const mergeDir = join(tmp, 'merge');
  mkdirSync(mergeDir);
  writeFileSync(join(mergeDir, 'x.csv'), lines('#route,B', '#direction,to_campus', '停留所,1', '甲,7:00', '丙,7:10'), 'utf8');
  writeFileSync(join(mergeDir, 'y.csv'), lines('#route,B', '#direction,to_campus', '停留所,1', '甲,8:00', '乙,8:05', '丙,8:10'), 'utf8');
  const m = importCsv(mergeDir, dataDir);
  assert.deepEqual(m.newStops.sort(), ['乙', '丙', '甲'].sort());
  const routes = JSON.parse(readFileSync(join(dataDir, 'routes.json'), 'utf8')) as { id: string; stops: Record<string, string[]> }[];
  assert.deepEqual(routes.find((x) => x.id === 'B')!.stops.to_campus, ['甲', '乙', '丙']);

  // エラーは行つきで分かりやすい
  const badDir = join(tmp, 'bad');
  mkdirSync(badDir);
  writeFileSync(join(badDir, 'b.csv'), lines('#route,A', '#direction,nowhere', '停留所,1', '駅前,7:00'), 'utf8');
  assert.throws(() => importCsv(badDir, dataDir), (e) => e instanceof ImportError && /nowhere/.test(e.message));
  writeFileSync(join(badDir, 'b.csv'), lines('#route,A', '#direction,to_campus', '停留所,1', '駅前,7:xx', '大学本部棟,7:30'), 'utf8');
  assert.throws(() => importCsv(badDir, dataDir), (e) => e instanceof ImportError && e.message.includes('b.csv 4行目'));
  writeFileSync(join(badDir, 'b.csv'), lines('#route,A', '停留所,1', '駅前,7:00'), 'utf8');
  assert.throws(() => importCsv(badDir, dataDir), (e) => e instanceof ImportError && e.message.includes('#direction'));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log('csv ok');
