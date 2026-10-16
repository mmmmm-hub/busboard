// data/*.json の型。形式の説明は docs/DATA_FORMAT.md を参照。

export type PeriodMode = 'arrive_before_start' | 'depart_after_end';
export type DayType = 'weekday' | 'saturday' | 'holiday';
export type TripDays = DayType | 'everyday';
export type BreaksBehavior = 'run' | 'suspend' | 'only';

export interface Direction {
  id: string;
  label: string;
  /** ボタンの補助表示(例: 「営業所方面」) */
  sub?: string;
  periodMode?: PeriodMode;
}

export interface Period {
  id: number | string;
  start: string;
  end: string;
}

export interface Notice {
  date: string;
  title: string;
  body?: string;
  important?: boolean;
}

export interface Site {
  name: string;
  subtitle?: string;
  notice?: string;
  footer?: string;
  /** 方向ごとの、最初に選ばれる乗車地・降車地 */
  defaults?: Record<string, { from: string; to: string }>;
  /** 運行日が切り替わる時刻(既定 "04:00")。0時〜この時刻は、前日のダイヤの続き(24:10発など)も「いま」に出す */
  serviceDayStart?: string;
  /** 時限の到着/出発の余裕(分) */
  arrivalBufferMin?: number;
  directions: Direction[];
  operators?: Record<string, { name: string; color?: string }>;
  periods?: { enabled: boolean; label: string; items: Period[] };
  calendar?: {
    /** 土曜の扱い。既定は 'holiday'(日曜・祝日と同じダイヤ)。'saturday' にすると土曜を独立した区分にする */
    saturdayAs?: 'saturday' | 'holiday';
    breaks?: { name: string; from: string; to: string }[];
    /** 日本の祝日を自動で休日にする(既定 true)。祝日も平日ダイヤで走るバスは false */
    nationalHolidays?: boolean;
    /** 祝日のほかに、休日として扱う日(会社独自の休みなど)。YYYY-MM-DD */
    holidays?: string[];
  };
  /** 時刻表タブの列に出す停留所(方向ごと)。省略時は全停留所 */
  timetableColumns?: Record<string, string[]>;
  notices?: Notice[];
}

export interface Stop {
  id: string;
  name: string;
  /** 路線IDごとののりば表示 */
  platforms?: Record<string, string>;
  /** 時刻表の列見出しに使う短い名前 */
  shortName?: string;
  /** 選択肢に出さない(別の停留所に統合して選ばせる) */
  hidden?: boolean;
  /** この停留所を選んだとき、便に含まれていればこちらの時刻も使う停留所ID */
  alias?: string[];
}

export interface Route {
  id: string;
  name: string;
  /** バッジの色(blue / orange / purple / teal / green / red / sky / slate) */
  color?: string;
  /** 方向ごとの停留所の並び */
  stops: Record<string, string[]>;
}

export interface Trip {
  id: string;
  route: string;
  direction: string;
  days?: TripDays;
  /** 長期休業中の扱い。run=通常通り / suspend=運休 / only=休業中のみ運行 */
  breaks?: BreaksBehavior;
  /** 休業中だけ使う時刻(指定時) */
  breakTimes?: Record<string, string>;
  operator?: string;
  label?: string;
  /** この日以降だけ運行 (YYYY-MM-DD) */
  from?: string;
  /** この日まで運行 (YYYY-MM-DD) */
  until?: string;
  times: Record<string, string>;
}

export interface TimetableData {
  site: Site;
  stops: Stop[];
  routes: Route[];
  trips: Trip[];
}

/** 検索結果の1件 */
export interface Hit {
  trip: Trip;
  route: Route;
  times: Record<string, string>;
  fromId: string;
  toId: string;
  dep: number;
  arr: number;
}
