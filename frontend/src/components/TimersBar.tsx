import { formatClock } from "../lib/timers";
import { Timer } from "../lib/useTimers";

export default function TimersBar({ timers, now, onClose }: { timers: Timer[]; now: number; onClose: (id: number) => void }) {
  if (!timers.length) return null;
  return (
    <div className="timers">
      {timers.map((t) => (
        <div key={t.id} className={`timer ${t.done ? "finished" : ""}`}>
          <span>{t.label}</span>
          <strong>{t.done ? "Gotowe!" : formatClock((t.endsAt - now) / 1000)}</strong>
          <button type="button" className="link" onClick={() => onClose(t.id)} aria-label="Zamknij minutnik">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
