import { CSSProperties, useLayoutEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { formatClock } from "../lib/timers";
import { Timer, useTimers } from "../lib/useTimers";

// Ostatnia minuta zmienia kolor na bursztynowy - widać kątem oka, że zaraz trzeba podejść
const SOON_MS = 60_000;

// Etykieta "Naleśniki, krok 2: 10 min" -> przepis "Naleśniki" i krótki krok "krok 2 · 10 min"
function splitLabel(label: string): [string, string] {
  const at = label.lastIndexOf(", krok ");
  if (at <= 0) return ["", label];
  return [label.slice(0, at), label.slice(at + 2).replace(/^(krok \d+): /, "$1 · ")];
}

// Pasek minutników na dole ekranu - widoczny na każdym ekranie aplikacji.
// Ciemna pastylka z dużym czasem i paskiem postępu; przyciski 48 px: "+1 min" i zamknij.
// Wysokość paska trafia do zmiennej CSS --timers-h: treść ekranu robi pod nim tyle miejsca,
// a "Gotuj" stoi nad nim (styles.css).
export default function TimersBar() {
  const { timers, now, remove, extend } = useTimers();
  const location = useLocation();
  const bar = useRef<HTMLDivElement>(null);
  const shown = timers.length > 0;

  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    const root = document.documentElement.style;
    const update = () => root.setProperty("--timers-h", `${Math.ceil(el.getBoundingClientRect().height)}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.removeProperty("--timers-h");
    };
  }, [shown]);

  if (!shown) return null;
  const cooking = location.pathname.endsWith("/gotuj");
  return (
    <div ref={bar} className={`timers ${cooking ? "cooking-timers" : ""}`} role="region" aria-label="Minutniki">
      {timers.map((t) => {
        // Na ekranie tego samego przepisu (albo w jego trybie gotowania) nazwa przepisu jest zbędna
        const here = location.pathname === `/przepis/${t.recipeId}` || location.pathname === `/przepis/${t.recipeId}/gotuj`;
        return <TimerPill key={t.id} timer={t} now={now} here={here} onExtend={() => extend(t.id, 60)} onClose={() => remove(t.id)} />;
      })}
    </div>
  );
}

function TimerPill({ timer: t, now, here, onExtend, onClose }: { timer: Timer; now: number; here: boolean; onExtend: () => void; onClose: () => void }) {
  const left = t.endsAt - now;
  const state = t.done ? "finished" : left <= SOON_MS ? "soon" : "";
  const progress = t.total ? Math.min(1, Math.max(0, 1 - left / (t.total * 1000))) : 0;
  const [recipe, step] = splitLabel(t.label);
  const text =
    recipe && !here ? (
      <>
        <small>
          {recipe}
          <span className="sr-only">, </span>
        </small>
        <b>{step}</b>
      </>
    ) : (
      <b>{step.charAt(0).toUpperCase() + step.slice(1)}</b>
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
