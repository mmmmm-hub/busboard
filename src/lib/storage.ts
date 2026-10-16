// 端末ローカル(localStorage)への保存。プライベートモード等で使えない場合は、
// タブ内のメモリに保存してアプリを落とさない。

export const STORAGE_KEYS = {
  stopFrom: 'busboard_from',
  stopTo: 'busboard_to',
  direction: 'busboard_direction',
  readNoticeDate: 'busboard_read_notice_date',
  timetableStops: 'busboard_timetable_stops',
} as const;

const memory = new Map<string, string>();

export function readString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

export function writeString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    memory.set(key, value);
  }
}
