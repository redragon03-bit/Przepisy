import { Link, useLocation } from "react-router-dom";
import { formatClock } from "../lib/timers";
import { useTimers } from "../lib/useTimers";

// Pasek minutników na dole ekranu - widoczny na każdym ekranie aplikacji
export default function TimersBar() {
  const { timers, now, remove } = useTimers();
  const location = useLocation();
  if (!timers.length) return null;
  return (
    <div className={`timers ${location.pathname.endsWith("/gotuj") ? "cooking-timers" : ""}`}>
      {timers.map((t) => {
        const label = <span>{t.label}</span>;
        return (
          <div key={t.id} className={`timer ${t.done ? "finished" : ""}`}>
            {t.recipeId && location.pathname !== `/przepis/${t.recipeId}` ? <Link to={`/przepis/${t.recipeId}`}>{label}</Link> : label}
            <strong>{t.done ? "Gotowe!" : formatClock((t.endsAt - now) / 1000)}</strong>
            <button type="button" className="link" onClick={() => remove(t.id)} aria-label="Zamknij minutnik">
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
