import { MouseEvent, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { applyTheme, FX, loadTheme, MODES, resolveScheme, saveTheme, THEMES, ThemeChoice } from "../lib/theme";

// Ustawienia → Wygląd → Motyw: kafelki z kolorami motywu, tryb jasny/ciemny i efekty. Zmiana działa od razu.
export default function ThemePicker() {
  const [choice, setChoice] = useState<ThemeChoice>(loadTheme);
  const [systemDark, setSystemDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);

  useEffect(() => {
    applyTheme(choice);
    saveTheme(choice);
  }, [choice]);

  useEffect(() => {
    const m = matchMedia("(prefers-color-scheme: dark)");
    const on = () => setSystemDark(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);

  // Nowe kolory rozlewają się kołem od miejsca stuknięcia (gdzie przeglądarka to umie i efekty są włączone)
  const change = (e: MouseEvent, patch: Partial<ThemeChoice>) => {
    const next = { ...choice, ...patch };
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!document.startViewTransition || next.fx === "off" || reduced) {
      setChoice(next);
      return;
    }
    const { clientX: x, clientY: y } = e;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const t = document.startViewTransition(() => {
      flushSync(() => setChoice(next));
      applyTheme(next);
    });
    t.ready
      .then(() =>
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
          { duration: 650, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", pseudoElement: "::view-transition-new(root)" },
        ),
      )
      .catch(() => undefined);
  };

  const scheme = resolveScheme(choice.mode, systemDark);

  return (
    <div className="theme-picker">
      <h3 className="appearance-sub">Motyw</h3>
      <div className="theme-grid" role="radiogroup" aria-label="Motyw">
        {THEMES.map((t) => {
          const p = t[scheme];
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={choice.theme === t.id}
              className="theme-tile"
              style={{ background: p.bg, color: p.text, borderColor: choice.theme === t.id ? p["accent-strong"] : p.border }}
              onClick={(e) => change(e, { theme: t.id })}
            >
              <span className="theme-swatches" aria-hidden="true">
                <i style={{ background: `linear-gradient(135deg, ${p["accent-strong"]}, ${p["accent-2"]})` }} />
                <i style={{ background: p["accent-soft"] }} />
                <i style={{ background: p.surface, borderColor: p.border }} />
              </span>
              <b>{t.label}</b>
              <small style={{ color: p.muted }}>{t.hint}</small>
            </button>
          );
        })}
      </div>
      <div className="segmented theme-mode" role="group" aria-label="Jasny czy ciemny">
        {MODES.map((m) => (
          <button key={m.id} type="button" aria-pressed={choice.mode === m.id} onClick={(e) => change(e, { mode: m.id })}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="muted small theme-fx-label">Efekty: gradienty, połysk i drobinki w klimacie motywu</p>
      <div className="segmented theme-mode" role="group" aria-label="Efekty">
        {FX.map((f) => (
          <button key={f.id} type="button" aria-pressed={choice.fx === f.id} onClick={(e) => change(e, { fx: f.id })}>
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
