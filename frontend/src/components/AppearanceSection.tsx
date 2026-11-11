import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import {
  applyScales,
  clampScale,
  DEFAULT_SCALES,
  deviceLabel,
  loadScales,
  saveScales,
  SCALE_GROUPS,
  SCALE_MAX,
  SCALE_MIN,
  SCALE_STEP,
  ScaleKey,
  Scales,
  scalesSummary,
} from "../lib/uiScale";

// Ustawienia → Wygląd: każda grupa czcionek, kółka i odstępy osobno, co 5%.
// Zmiana działa od razu; po chwili trafia też do logu dodatku na serwerze (żeby było wiadomo, co jest ustawione).
export default function AppearanceSection() {
  const [scales, setScales] = useState<Scales>(loadScales);
  const [saved, setSaved] = useState("");
  const first = useRef(true);

  useEffect(() => {
    applyScales(scales);
    saveScales(scales);
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => {
      api
        .saveAppearance(scales, deviceLabel())
        .then((r) => setSaved(new Date(r.saved_at).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })))
        .catch(() => setSaved(""));
    }, 800);
    return () => clearTimeout(timer);
  }, [scales]);

  const change = (key: ScaleKey, delta: number) => setScales((s) => ({ ...s, [key]: clampScale(s[key] + delta) }));

  return (
    <section className="box">
      <h2>Wygląd</h2>
      <p className="muted small">Wielkość każdej grupy osobno, co {SCALE_STEP}%. Zmiana działa od razu i dotyczy tego telefonu.</p>
      <ul className="scale-list">
        {SCALE_GROUPS.map((g) => (
          <li key={g.key}>
            <span className="grow">
              {g.label}
              <span className="muted small block">{g.hint}</span>
            </span>
            <span className="stepper">
              <button type="button" onClick={() => change(g.key, -SCALE_STEP)} disabled={scales[g.key] <= SCALE_MIN} aria-label={`${g.label}: mniejsze`}>
                −
              </button>
              <output className="scale-value" aria-label={`${g.label}: wielkość`}>
                {scales[g.key]}%
              </output>
              <button type="button" onClick={() => change(g.key, SCALE_STEP)} disabled={scales[g.key] >= SCALE_MAX} aria-label={`${g.label}: większe`}>
                +
              </button>
            </span>
          </li>
        ))}
      </ul>
      <p className="small scale-summary">
        Ustawione teraz: <b>{scalesSummary(scales)}</b>
        {saved && <span className="muted"> · zapisane w logu {saved}</span>}
      </p>
      <button type="button" className="small" onClick={() => setScales({ ...DEFAULT_SCALES })} disabled={scalesSummary(scales) === scalesSummary(DEFAULT_SCALES)}>
        Przywróć 100%
      </button>
    </section>
  );
}
