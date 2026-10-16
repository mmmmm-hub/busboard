// 日本の祝日(国民の祝日)を、計算で求める。外部のデータやライブラリは使わない。
// 対応する年は 2000〜2099 年。範囲外の年は、祝日なしとして扱う。
//
// 含むもの: 通常の祝日、春分・秋分の日、振替休日、国民の休日(祝日に挟まれた日)、
// 2019年の即位に伴う祝日、2020・2021年の東京オリンピックに伴う祝日の移動。
// 政府が将来に祝日を変えたときは、この関数を直すか、site.json の calendar.holidays に
// 日付を足す。

const key = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** その月の第n月曜日の「日」 */
function nthMonday(y: number, m: number, n: number): number {
  const w = new Date(y, m - 1, 1).getDay(); // 1日の曜日(0=日曜)
  const first = 1 + ((8 - w) % 7);          // 最初の月曜日
  return first + 7 * (n - 1);
}

const vernalEquinox = (y: number) => Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
const autumnalEquinox = (y: number) => Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));

const cache = new Map<number, Set<string>>();

function holidaysOfYear(y: number): Set<string> {
  const cached = cache.get(y);
  if (cached) return cached;

  const base: [number, number][] = [
    [1, 1],                                        // 元日
    [1, nthMonday(y, 1, 2)],                       // 成人の日
    [2, 11],                                       // 建国記念の日
    [3, vernalEquinox(y)],                         // 春分の日
    [4, 29],                                       // 昭和の日
    [5, 3], [5, 4], [5, 5],                        // 憲法記念日・みどりの日・こどもの日
    [9, autumnalEquinox(y)],                       // 秋分の日
    [11, 3],                                       // 文化の日
    [11, 23],                                      // 勤労感謝の日
  ];
  if (y >= 2020) base.push([2, 23]);               // 天皇誕生日(2019年はなし)
  if (y >= 1989 && y <= 2018) base.push([12, 23]);

  // 海の日 / 山の日 / スポーツの日(体育の日)は、2020・2021年だけ東京オリンピックに合わせて移動
  if (y === 2020) base.push([7, 23], [7, 24], [8, 10]);
  else if (y === 2021) base.push([7, 22], [7, 23], [8, 8]);
  else {
    base.push([7, y >= 2003 ? nthMonday(y, 7, 3) : 20]);   // 海の日
    if (y >= 2016) base.push([8, 11]);                     // 山の日
    base.push(y <= 2019 || y >= 2022 ? [10, nthMonday(y, 10, 2)] : [10, 0]); // 体育の日・スポーツの日
  }
  base.push([9, y >= 2003 ? nthMonday(y, 9, 3) : 15]);     // 敬老の日
  if (y === 2019) base.push([5, 1], [10, 22]);             // 天皇の即位に伴う祝日
  const days = base.filter(([, d]) => d > 0);

  const set = new Set(days.map(([m, d]) => key(y, m, d)));

  // 振替休日: 祝日が日曜なら、次の「祝日でない日」が休みになる
  for (const [m, d] of [...days].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    if (new Date(y, m - 1, d).getDay() !== 0) continue;
    const next = new Date(y, m - 1, d + 1);
    while (set.has(key(next.getFullYear(), next.getMonth() + 1, next.getDate()))) next.setDate(next.getDate() + 1);
    set.add(key(next.getFullYear(), next.getMonth() + 1, next.getDate()));
  }

  // 国民の休日: 前日と翌日がどちらも祝日の、平日(日曜は除く)
  for (let m = 1; m <= 12; m++) {
    const last = new Date(y, m, 0).getDate();
    for (let d = 1; d <= last; d++) {
      const day = new Date(y, m - 1, d);
      if (day.getDay() === 0 || set.has(key(y, m, d))) continue;
      const prev = new Date(y, m - 1, d - 1), next = new Date(y, m - 1, d + 1);
      if (set.has(key(prev.getFullYear(), prev.getMonth() + 1, prev.getDate())) &&
          set.has(key(next.getFullYear(), next.getMonth() + 1, next.getDate()))) {
        set.add(key(y, m, d));
      }
    }
  }

  cache.set(y, set);
  return set;
}

/** 日本の祝日(振替休日・国民の休日を含む)か。2000〜2099年のみ対応 */
export function isJapaneseHoliday(d: Date): boolean {
  const y = d.getFullYear();
  if (y < 2000 || y > 2099) return false;
  return holidaysOfYear(y).has(key(y, d.getMonth() + 1, d.getDate()));
}
