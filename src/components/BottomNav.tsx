import { Link, useLocation } from 'react-router-dom';
import { Home, Clock, Bell, Info } from 'lucide-react';

interface Props {
  /** お知らせ(site.json の notices)があるときだけタブを出す */
  showNews: boolean;
  hasNewNews: boolean;
  /** 案内ページ(public/data/about.md)があるときだけタブを出す */
  showAbout: boolean;
}

// 下部ナビゲーションバー(ホーム / 時刻表 / お知らせ)
export default function BottomNav({ showNews, hasNewNews, showAbout }: Props) {
  const { pathname } = useLocation();
  // 各項目はグリッドの1マス全体をタップできる(最小44px)。選択中は色だけで示し、文字の太さは変えない(幅がずれるため)
  const item = (active: boolean) =>
    `justify-self-stretch min-h-11 py-1 flex flex-col items-center justify-center gap-1 text-[12px] font-semibold transition-colors border-none bg-transparent cursor-pointer ${active ? 'text-orange-700' : 'text-slate-600 hover:text-slate-800'}`;

  return (
    <nav aria-label="メインメニュー" className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-100/60 pt-3.5 pb-[calc(22px+env(safe-area-inset-bottom,16px))] px-3 shadow-[0_-6px_20px_rgba(0,0,0,0.03)]">
      <div style={{ gridTemplateColumns: `repeat(${2 + Number(showNews) + Number(showAbout)}, minmax(0, 1fr))` }}
        className="max-w-md mx-auto grid items-end">
        <Link to="/" aria-current={pathname === '/' ? 'page' : undefined} className={item(pathname === '/')}>
          <Home className="w-5 h-5 stroke-[2.25]" />
          <span>ホーム</span>
        </Link>
        <Link to="/timetable" aria-current={pathname === '/timetable' ? 'page' : undefined} className={item(pathname === '/timetable')}>
          <Clock className="w-5 h-5 stroke-[2.25]" />
          <span>時刻表</span>
        </Link>
        {showNews && (
          <Link to="/news" aria-current={pathname === '/news' ? 'page' : undefined} className={item(pathname === '/news')}>
            <span className="relative">
              <Bell className="w-5 h-5 stroke-[2.25]" />
              {hasNewNews && (
                <>
                  <span aria-hidden="true" className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white" />
                  <span className="sr-only">新着あり</span>
                </>
              )}
            </span>
            <span>お知らせ</span>
          </Link>
        )}
        {showAbout && (
          <Link to="/about" aria-current={pathname === '/about' ? 'page' : undefined} className={item(pathname === '/about')}>
            <Info className="w-5 h-5 stroke-[2.25]" />
            <span>案内</span>
          </Link>
        )}
      </div>
    </nav>
  );
}
