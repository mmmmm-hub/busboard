// CSV → データ: npm run import [CSVのフォルダ(既定: timetable-csv)] [dataフォルダ(既定: public/data)]
import { resolve } from 'node:path';
import { ImportError, importCsv } from './lib/csvio';
import { validateDir } from './validate';

const csvDir = resolve(process.argv[2] ?? 'timetable-csv');
const dataDir = resolve(process.argv[3] ?? 'public/data');

try {
  const r = importCsv(csvDir, dataDir);
  console.log(`取り込みました: CSV ${r.files}ファイル → ${r.trips}便`);
  if (r.newRoutes.length) console.log(`  新しい路線: ${r.newRoutes.join('、')}(routes.json で名前と色を直せます)`);
  if (r.newStops.length) console.log(`  新しい停留所: ${r.newStops.join('、')}`);
  const problems = validateDir(dataDir);
  if (problems.length) {
    console.error('\n取り込みはできましたが、データに問題があります:\n' + problems.map((p) => '  × ' + p).join('\n'));
    process.exit(1);
  }
  console.log('検査も問題ありません。');
} catch (e) {
  if (e instanceof ImportError) {
    console.error('取り込めませんでした:\n' + e.problems.map((p) => '  × ' + p).join('\n'));
    process.exit(1);
  }
  throw e;
}
