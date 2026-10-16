import { Dialog, DialogContent, DialogDescription, DialogTitle, ScrollArea, Button } from './ui';
import { resolveStop } from '../lib/logic';
import { useTimetable } from '../lib/data';
import { operatorBadge, routeBadge } from '../lib/palette';
import { toMin, tripTimes } from '../lib/logic';
import type { Trip } from '../types';

interface Props {
  trip: Trip | null;
  date: Date;
  /** 強調する乗車地・降車地(省略可) */
  fromId?: string;
  toId?: string;
  now?: Date;
  onClose: () => void;
}

// 便をタップしたときの「停車するバス停の一覧」ダイアログ(ホーム・時刻表で共通)
export default function TripDetailDialog({ trip, date, fromId, toId, now, onClose }: Props) {
  const { site, stopsById, routes } = useTimetable();
  const nowMin = now ? now.getHours() * 60 + now.getMinutes() : null;

  return (
    <Dialog open={!!trip} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md w-[92vw] rounded-2xl p-0 overflow-hidden gap-0 border border-slate-200">
        {trip && (() => {
          const times = tripTimes(site, trip, date);
          const route = routes.find((r) => r.id === trip.route);
          const op = trip.operator ? site.operators?.[trip.operator] : undefined;
          const direction = site.directions.find((d) => d.id === trip.direction);
          const hiFrom = fromId ? resolveStop(stopsById, fromId, times) : null;
          const hiTo = toId ? resolveStop(stopsById, toId, times) : null;
          const rows = Object.keys(times).sort((a, b) => (toMin(times[a]) ?? 0) - (toMin(times[b]) ?? 0));
          const first = rows[0];
          const start = (hiFrom && times[hiFrom]) || (first && times[first]);

          return (
            <>
              <div className="p-5 border-b border-slate-100">
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {route && (
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${routeBadge(route.color)}`}>{route.name}</span>
                  )}
                  {op && (
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${operatorBadge(op.color)}`}>{op.name}</span>
                  )}
                  {trip.label && (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">{trip.label}</span>
                  )}
                </div>
                <DialogTitle className="text-2xl font-semibold text-slate-900 flex items-baseline gap-1.5 leading-none">
                  {start}
                  <span className="text-sm font-normal text-slate-700">発車</span>
                </DialogTitle>
                <DialogDescription className="text-[12px] mt-1.5 text-slate-700">
                  {direction?.label ?? ''}・停車するバス停の一覧
                </DialogDescription>
              </div>

              <ScrollArea className="max-h-[48vh]">
                <div className="p-5">
                  <div className="relative border-l-2 border-slate-100 ml-3.5 space-y-6">
                    {rows.map((id) => {
                      const highlight = id === hiFrom || id === hiTo;
                      const past = nowMin != null && (toMin(times[id]) ?? 0) < nowMin;
                      return (
                        <div key={id} className="relative pl-6">
                          <div className={`absolute -left-[10px] top-1 w-[18px] h-[18px] rounded-full border-2 bg-white flex items-center justify-center ${highlight ? 'border-orange-500' : 'border-slate-200'}`}>
                            {highlight && <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />}
                          </div>
                          <div className="flex justify-between items-center">
                            <div className={`text-sm ${highlight ? 'font-semibold text-slate-900' : past ? 'text-slate-500' : 'text-slate-600'}`}>
                              {stopsById.get(id)?.name ?? id}
                            </div>
                            <div className={`text-[15px] font-medium tabular-nums ${highlight ? 'text-orange-700' : past ? 'text-slate-500' : 'text-slate-700'}`}>
                              {times[id]}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </ScrollArea>

              <div className="p-4 border-t border-slate-100 flex justify-end">
                <Button variant="secondary" size="sm" onClick={onClose} className="h-11 rounded-xl px-6 font-medium border border-slate-200">
                  閉じる
                </Button>
              </div>
            </>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
}
