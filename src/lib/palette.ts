// バッジの色。Tailwindはクラス名を静的に解析するため、文字列を組み立てずに一覧で持つ。
// 色名は routes.json の color / site.json の operators.*.color で指定する。

const SOFT: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
  teal: 'bg-teal-50 text-teal-700 border-teal-200',
  green: 'bg-green-50 text-green-700 border-green-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  sky: 'bg-sky-50 text-sky-700 border-sky-200',
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
};

const SOLID: Record<string, string> = {
  blue: 'bg-blue-700 text-white border-transparent',
  orange: 'bg-orange-700 text-white border-transparent',
  purple: 'bg-purple-700 text-white border-transparent',
  teal: 'bg-teal-700 text-white border-transparent',
  green: 'bg-green-700 text-white border-transparent',
  red: 'bg-red-700 text-white border-transparent',
  sky: 'bg-sky-700 text-white border-transparent',
  slate: 'bg-slate-700 text-white border-transparent',
};

/** 指定できる色名(データの検査でも使う) */
export const COLOR_NAMES = Object.keys(SOFT);

/** 路線のバッジ(淡い色) */
export const routeBadge = (color?: string) => SOFT[color ?? ''] ?? SOFT.slate;
/** 運行会社のバッジ(濃い単色) */
export const operatorBadge = (color?: string) => SOLID[color ?? ''] ?? SOLID.slate;
