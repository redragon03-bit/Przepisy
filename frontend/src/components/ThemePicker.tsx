import { useEffect, useState } from "react";
import { applyTheme, loadTheme, MODES, resolveScheme, saveTheme, THEMES, ThemeChoice } from "../lib/theme";

// Ustawienia → Wygląd → Motyw: kafelki z kolorami motywu + tryb jasny/ciemny. Zmiana działa od razu.
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
              onClick={() => setChoice((c) => ({ ...c, theme: t.id }))}
            >
              <span className="theme-swatches" aria-hidden="true">
                <i style={{ background: p.accent }} />
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
          <button key={m.id} type="button" aria-pressed={choice.mode === m.id} onClick={() => setChoice((c) => ({ ...c, mode: m.id }))}>
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
