import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import BottomNav from './BottomNav';
import { useTimetable } from '../lib/data';
import { STORAGE_KEYS, readString } from '../lib/storage';

// アプリの外枠: 上部ヘッダー + スマホ幅の本文 + 下部ナビ
export default function Layout() {
  const { site, about } = useTimetable();
  const { pathname } = useLocation();
  const notices = site.notices ?? [];
  const latest = notices.reduce((m, n) => (n.date > m ? n.date : m), '');
  const [hasNew, setHasNew] = useState(false);

  // 最新のお知らせ日付が、最後に開いた日付より新しければ赤丸を出す
  useEffect(() => {
    setHasNew(!!latest && (readString(STORAGE_KEYS.readNoticeDate) ?? '') < latest);
  }, [latest, pathname]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans antialiased">
      <header className="sticky top-0 z-50 h-16 flex flex-col justify-center bg-white border-b border-slate-100 px-4 shadow-xs">
        <span className="text-xl font-black text-slate-900 tracking-tight block leading-tight">{site.name}</span>
        {site.subtitle && <span className="text-[10px] text-slate-500 font-bold tracking-wider block">{site.subtitle}</span>}
      </header>

      <main className="flex-1 flex flex-col max-w-md w-full mx-auto bg-white shadow-xs min-h-[calc(100vh-64px)] pb-[calc(22px+env(safe-area-inset-bottom,16px)+76px)]">
        <div className="flex-1 flex flex-col">
          <Outlet />
        </div>
        <footer className="w-full text-center text-[12px] text-slate-500 py-3 border-t border-slate-100 px-4 space-y-1">
          {site.notice && <p>{site.notice}</p>}
          <p>時刻は変更されることがあります。必ず公式の案内もご確認ください。</p>
          {site.footer && <p>{site.footer}</p>}
        </footer>
      </main>

      <BottomNav showNews={notices.length > 0} hasNewNews={hasNew} showAbout={about !== null} />
    </div>
  );
}
