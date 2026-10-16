import { Fragment } from 'react';
import { useTimetable } from '../lib/data';
import { parseMarkdown, type Inline } from '../lib/markdown';

function Inlines({ items }: { items: Inline[] }) {
  return (
    <>
      {items.map((it, i) => {
        if (it.type === 'bold') return <strong key={i} className="font-semibold text-slate-900">{it.text}</strong>;
        if (it.type === 'code') return <code key={i} className="px-1 py-0.5 rounded bg-slate-100 text-[0.9em]">{it.text}</code>;
        if (it.type === 'link') {
          const external = /^https?:/i.test(it.href);
          return (
            <a
              key={i}
              href={it.href}
              {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className="text-orange-700 underline underline-offset-2 break-words"
            >
              {it.text}
            </a>
          );
        }
        return <Fragment key={i}>{it.text}</Fragment>;
      })}
    </>
  );
}

// ご利用案内(public/data/about.md に書いた文章をそのまま表示する)
export default function AboutPage() {
  const { about } = useTimetable();
  const blocks = parseMarkdown(about ?? '');

  return (
    <div className="bg-slate-50 w-full flex-1 p-3">
      <article className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 text-[14px] leading-relaxed text-slate-700">
        {blocks.map((b, i) => {
          if (b.type === 'heading') {
            const cls = b.level === 1 ? 'text-lg font-bold text-slate-900' : b.level === 2 ? 'text-base font-semibold text-slate-900 pt-2' : 'text-sm font-semibold text-slate-900';
            const Tag = (`h${b.level + 1}`) as 'h2' | 'h3' | 'h4'; // ページの見出し(h1)はヘッダーにあるので、1つ下げる
            return <Tag key={i} className={cls}><Inlines items={b.inlines} /></Tag>;
          }
          if (b.type === 'hr') return <hr key={i} className="border-slate-200" />;
          if (b.type === 'paragraph') {
            return (
              <p key={i}>
                {b.lines.map((line, j) => (
                  <Fragment key={j}>
                    {j > 0 && <br />}
                    <Inlines items={line} />
                  </Fragment>
                ))}
              </p>
            );
          }
          const List = b.type;
          return (
            <List key={i} className={`${b.type === 'ul' ? 'list-disc' : 'list-decimal'} pl-5 space-y-1`}>
              {b.items.map((item, j) => <li key={j}><Inlines items={item} /></li>)}
            </List>
          );
        })}
      </article>
    </div>
  );
}
