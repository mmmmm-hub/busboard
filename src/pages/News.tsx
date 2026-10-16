import { useEffect } from 'react';
import { useTimetable } from '../lib/data';
import { STORAGE_KEYS, writeString } from '../lib/storage';

// お知らせ(site.json の notices)。運休・ダイヤ変更の連絡に使う
export default function NewsPage() {
  const { site } = useTimetable();
  const list = [...(site.notices ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1));

  useEffect(() => {
    if (list[0]) writeString(STORAGE_KEYS.readNoticeDate, list[0].date);
  }, [list]);

  return (
    <div className="bg-slate-50 w-full flex-1 p-3 space-y-3">
      <h2 className="text-lg font-semibold text-slate-900 px-1 pt-1">お知らせ</h2>
      {list.length === 0 && <p className="text-sm text-slate-500 px-1">お知らせはありません。</p>}
      {list.map((n, i) => (
        <article key={i} className={`bg-white rounded-2xl border p-4 ${n.important ? 'border-orange-200' : 'border-slate-200'}`}>
          <p className="text-[11px] text-slate-500 tabular-nums">{n.date}</p>
          <h3 className="text-sm font-semibold text-slate-900 mt-0.5">{n.title}</h3>
          {n.body && <p className="text-[13px] text-slate-700 leading-relaxed mt-1.5 whitespace-pre-wrap">{n.body}</p>}
        </article>
      ))}
    </div>
  );
}
