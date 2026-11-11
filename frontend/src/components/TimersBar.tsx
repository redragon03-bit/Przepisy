import { CSSProperties } from "react";
import { Link, useLocation } from "react-router-dom";
import { formatClock } from "../lib/timers";
import { Timer, useTimers } from "../lib/useTimers";

// Ostatnia minuta zmienia kolor na bursztynowy - widać kątem oka, że zaraz trzeba podejść
const SOON_MS = 60_000;

// Etykieta "Naleśniki, krok 2: 10 min" -> mała linia z przepisem i duża z krokiem
function splitLabel(label: string): [string, string] {
  const at = label.lastIndexOf(", krok ");
  return at > 0 ? [label.slice(0, at), label.slice(at + 2)] : ["", label];
}

// Pasek minutników na dole ekranu - widoczny na każdym ekranie aplikacji.
// Ciemna pastylka z dużym czasem i paskiem postępu; przyciski 48 px: "+1 min" i zamknij.
export default function TimersBar() {
  const { timers, now, remove, extend } = useTimers();
  const location = useLocation();
  if (!timers.length) return null;
  return (
    <div className={`timers ${location.pathname.endsWith("/gotuj") ? "cooking-timers" : ""}`} role="region" aria-label="Minutniki">
      {timers.map((t) => (
        <TimerPill key={t.id} timer={t} now={now} here={location.pathname === `/przepis/${t.recipeId}`} onExtend={() => extend(t.id, 60)} onClose={() => remove(t.id)} />
      ))}
    </div>
  );
}

function TimerPill({ timer: t, now, here, onExtend, onClose }: { timer: Timer; now: number; here: boolean; onExtend: () => void; onClose: () => void }) {
  const left = t.endsAt - now;
  const state = t.done ? "finished" : left <= SOON_MS ? "soon" : "";
  const progress = t.total ? Math.min(1, Math.max(0, 1 - left / (t.total * 1000))) : 0;
  const [recipe, step] = splitLabel(t.label);
  const text = (
    <>
      {recipe && (
        <small>
          {recipe}
          <span className="sr-only">, </span>
        </small>
      )}
      <b>{step}</b>
    </>
  );
  return (
    <div className={`timer ${state}`} style={{ "--p": progress } as CSSProperties} role={t.done ? "alert" : undefined}>
      {t.recipeId && !here ? (
        <Link className="timer-label" to={`/przepis/${t.recipeId}`}>
          {text}
        </Link>
      ) : (
        <span className="timer-label">{text}</span>
      )}
      <strong className="timer-time" aria-live="off">
        {t.done ? "Gotowe!" : formatClock(left / 1000)}
      </strong>
      <button type="button" className="timer-btn" onClick={onExtend} aria-label="Dodaj minutę">
        +1
      </button>
      <button type="button" className="timer-btn" onClick={onClose} aria-label="Zamknij minutnik">
        ✕
      </button>
    </div>
  );
}
