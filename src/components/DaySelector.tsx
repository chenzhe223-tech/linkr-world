import type { ItineraryItem as Item, TripDay } from '../lib/types';
import { dayItems, dayRoamKm, paceOf, PACE_LABEL, parseStartMinutes } from '../lib/tripMath';

interface DaySelectorProps {
  days: TripDay[];
  items: Item[];
  selectedDay: number;
  onSelect: (d: number) => void;
}

export function DaySelector({ days, items, selectedDay, onSelect }: DaySelectorProps) {
  const handleKey = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = e.key === 'ArrowRight' ? Math.min(days.length - 1, index + 1) : Math.max(0, index - 1);
      onSelect(next);
      const el = document.getElementById(`day-tab-${next}`);
      el?.focus();
    }
    if (e.key === 'Home') {
      e.preventDefault();
      onSelect(0);
      document.getElementById('day-tab-0')?.focus();
    }
    if (e.key === 'End') {
      e.preventDefault();
      const last = days.length - 1;
      onSelect(last);
      document.getElementById(`day-tab-${last}`)?.focus();
    }
  };

  return (
    <div className="day-selector" role="tablist" aria-label="按天切换行程">
      {days.map((d) => {
        const list = dayItems(items, d.index);
        const km = dayRoamKm(items, d.index);
        const pace = paceOf(km);
        const first = list.length > 0 ? parseStartMinutes(list[0].time) : null;
        const last = list.length > 0 ? parseStartMinutes(list[list.length - 1].time) : null;
        const span =
          first !== null && last !== null
            ? `${String(Math.floor(first / 60)).padStart(2, '0')}:${String(first % 60).padStart(2, '0')}–${String(Math.floor(last / 60)).padStart(2, '0')}:${String(last % 60).padStart(2, '0')}`
            : '—';

        return (
          <button
            key={d.index}
            id={`day-tab-${d.index}`}
            type="button"
            role="tab"
            className="day-tab"
            aria-selected={d.index === selectedDay}
            aria-controls="day-panel"
            tabIndex={d.index === selectedDay ? 0 : -1}
            onClick={() => onSelect(d.index)}
            onKeyDown={(e) => handleKey(e, d.index)}
          >
            <span className="dnum">
              DAY {String(d.index + 1).padStart(2, '0')}
              <span className={`pace-dot ${pace}`} aria-hidden="true" />
            </span>
            <span className="dname">{d.theme}</span>
            <span className="ddate">
              {d.date} · {span} · {PACE_LABEL[pace]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
