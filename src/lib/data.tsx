import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Route, Site, Stop, TimetableData, Trip } from '../types';

type Loaded = TimetableData & { stopsById: Map<string, Stop> };

const Ctx = createContext<Loaded | null>(null);

// base が './' なので、どのURL配下に置いても data/ を相対で読める
const getJson = async <T,>(file: string): Promise<T> => {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${file}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`data/${file} を読み込めませんでした (${res.status})`);
  return res.json() as Promise<T>;
};

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<TimetableData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getJson<Site>('site.json'),
      getJson<Stop[]>('stops.json'),
      getJson<Route[]>('routes.json'),
      getJson<Trip[]>('trips.json'),
    ])
      .then(([site, stops, routes, trips]) => {
        // 画面が真っ白にならないよう、最低限そろっているかを確かめる(細かい検査は npm run validate)
        const missing = [
          !site?.directions?.length && 'site.json の directions(方向の一覧)',
          (stops?.length ?? 0) < 2 && 'stops.json の停留所(2か所以上)',
          !routes?.length && 'routes.json の路線',
          !trips?.length && 'trips.json の便',
        ].filter(Boolean);
        if (missing.length) throw new Error(`${missing.join('、')}がありません。npm run validate で詳しく確認できます`);
        document.title = site.name;
        setData({ site, stops, routes, trips });
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const value = useMemo<Loaded | null>(
    () => (data ? { ...data, stopsById: new Map(data.stops.map((s) => [s.id, s])) } : null),
    [data],
  );

  if (error) {
    return <p className="p-6 text-sm text-slate-700">データを読み込めませんでした: {error}</p>;
  }
  if (!value) return <p className="p-6 text-sm text-slate-500">読み込み中...</p>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTimetable(): Loaded {
  const v = useContext(Ctx);
  if (!v) throw new Error('DataProvider の外で useTimetable を呼んでいます');
  return v;
}
