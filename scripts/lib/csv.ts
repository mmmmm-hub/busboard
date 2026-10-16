// CSVの読み書きに使う小さな道具(外部ライブラリなし)

/** CSV文字列 → 行×セルの配列。ダブルクォート("...")・セル内の改行・CRLFに対応 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const needsQuote = (s: string) => /[",\r\n]/.test(s);

/** 行×セルの配列 → CSV文字列(Excelで開けるようBOM付きUTF-8、改行はCRLF) */
export function toCsv(rows: string[][]): string {
  const body = rows.map((r) => r.map((c) => (needsQuote(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\r\n');
  return '﻿' + body + '\r\n';
}

/** ファイルのバイト列を文字列にする。UTF-8でなければ、Excelの既定(日本語Windowsの「CSV」)の Shift_JIS として読む */
export function decodeCsv(buf: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('shift_jis').decode(buf);
  }
}

/**
 * セルの時刻を "HH:MM" にそろえる。"7:05" "07:05" "7:05:00" "7時5分" "24:10" を受け付ける。
 * 時刻でなければ null。
 */
export function normalizeTime(raw: string): string | null {
  const s = raw
    .trim()
    .replace(/[０-９：]/g, (ch) => (ch === '：' ? ':' : String.fromCharCode(ch.charCodeAt(0) - 0xfee0)));
  const m = /^(\d{1,2})(?::|時)(\d{1,2})(?::\d{1,2}|分)?$/.exec(s);
  if (!m) return null;
  const h = +m[1], min = +m[2];
  if (min > 59 || h > 47) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** 日付 "2026/10/1" "2026-10-01" "2026年10月1日" を "YYYY-MM-DD" に。日付でなければ null */
export function normalizeDate(raw: string): string | null {
  const m = /^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?$/.exec(raw.trim());
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  if (d.getMonth() !== +m[2] - 1) return null;
  return `${m[1]}-${String(+m[2]).padStart(2, '0')}-${String(+m[3]).padStart(2, '0')}`;
}
