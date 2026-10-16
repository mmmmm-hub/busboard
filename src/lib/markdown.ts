// 案内ページ(public/data/about.md)用の、ごく小さな Markdown 読み取り。
// 使える書き方だけを受け付ける: 見出し(# ## ###)、箇条書き(- または 1.)、区切り線(---)、
// 太字(**)、コード(`)、リンク([表示](URL))。それ以外のHTMLなどは、ただの文字として扱う。
// 外部ライブラリを使わず、HTMLを組み立てないので、書かれた文章でページが壊れたり、
// 危険なコードが動いたりしない。

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; href: string };

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; inlines: Inline[] }
  | { type: 'paragraph'; lines: Inline[][] }
  | { type: 'ul' | 'ol'; items: Inline[][] }
  | { type: 'hr' };

/** リンク先として許すのは http / https / mailto / tel だけ(それ以外は null) */
export function safeHref(url: string): string | null {
  return /^(https?:\/\/|mailto:|tel:)/i.test(url.trim()) ? url.trim() : null;
}

const INLINE = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of src.matchAll(INLINE)) {
    if (m.index! > last) out.push({ type: 'text', text: src.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ type: 'bold', text: m[1] });
    else if (m[2] !== undefined) out.push({ type: 'code', text: m[2] });
    else {
      const href = safeHref(m[4]);
      // 許していない種類のリンクは、リンクにせず、書かれたとおりの文字で出す
      out.push(href ? { type: 'link', text: m[3], href } : { type: 'text', text: m[0] });
    }
    last = m.index! + m[0].length;
  }
  if (last < src.length) out.push({ type: 'text', text: src.slice(last) });
  return out;
}

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  let para: Inline[][] = [];
  let list: { type: 'ul' | 'ol'; items: Inline[][] } | null = null;

  const flush = () => {
    if (para.length) blocks.push({ type: 'paragraph', lines: para });
    if (list) blocks.push(list);
    para = [];
    list = null;
  };

  for (const raw of src.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.trim() === '') { flush(); continue; }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) { flush(); blocks.push({ type: 'heading', level: heading[1].length as 1 | 2 | 3, inlines: parseInline(heading[2]) }); continue; }

    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { flush(); blocks.push({ type: 'hr' }); continue; }

    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const type = bullet ? 'ul' : 'ol';
      if (para.length || (list && list.type !== type)) flush();
      list ??= { type, items: [] };
      list.items.push(parseInline((bullet ?? numbered)![1]));
      continue;
    }

    if (list) flush();
    para.push(parseInline(line.trim()));
  }
  flush();
  return blocks;
}
