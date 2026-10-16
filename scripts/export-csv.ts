// データ → CSV: npm run export-csv [dataフォルダ(既定: public/data)] [出力先(既定: timetable-csv)]
import { resolve } from 'node:path';
import { exportCsv } from './lib/csvio';

const dataDir = resolve(process.argv[2] ?? 'public/data');
const csvDir = resolve(process.argv[3] ?? 'timetable-csv');
const r = exportCsv(dataDir, csvDir);
console.log(`書き出しました: ${r.files}ファイル → ${csvDir}`);
if (r.skipped.length) console.warn(`CSVにできなかった便: ${r.skipped.join('、')}`);
