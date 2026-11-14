import { MouseEvent, useEffect, useRef, useState } from "react";
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

  // Wybrana grupa: stuknięcie elementu w podglądzie albo wiersza na liście
  const [picked, setPicked] = useState<ScaleKey | null>(null);
  const change = (key: ScaleKey, delta: number) => {
    setPicked(key);
    setScales((s) => ({ ...s, [key]: clampScale(s[key] + delta) }));
  };
  const pickFromPreview = (e: MouseEvent<HTMLElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-group]");
    setPicked((el?.dataset.group as ScaleKey | undefined) ?? "space");
  };
  // Klasa elementu podglądu: grupa + podświetlenie, gdy wybrana
  const g = (key: ScaleKey) => ({ "data-group": key, className: picked === key ? "picked" : undefined });
  const pickedGroup = SCALE_GROUPS.find((x) => x.key === picked);

  const stepper = (key: ScaleKey, label: string) => (
    <span className="stepper">
      <button type="button" onClick={() => change(key, -SCALE_STEP)} disabled={scales[key] <= SCALE_MIN} aria-label={`${label}: mniejsze`}>
        −
      </button>
      <output className="scale-value" aria-label={`${label}: wielkość`}>
        {scales[key]}%
      </output>
      <button type="button" onClick={() => change(key, SCALE_STEP)} disabled={scales[key] >= SCALE_MAX} aria-label={`${label}: większe`}>
        +
      </button>
    </span>
  );

  return (
    <section className="box">
      <h2>Wygląd</h2>
      <p className="muted small">Wielkość każdej grupy osobno, co {SCALE_STEP}%. Podgląd zmienia się od razu, ustawienia dotyczą tego telefonu.</p>
      {/* Podgląd: przykładowy przepis z prawdziwymi stylami aplikacji - zmienia się od razu */}
      <div className={`scale-preview${picked === "space" ? " picked" : ""}`} onClick={pickFromPreview} aria-label="Podgląd wyglądu">
        <h1 {...g("title")}>Placki ziemniaczane</h1>
        <p className="muted small">
          <span {...g("small")}>4 porcje · 30 min · 420 kcal</span>
        </p>
        <h2 {...g("title")}>Składniki</h2>
        <ul className="checklist">
          <li className="done">
            <span className={`check${picked === "check" ? " picked" : ""}`} data-group="check" aria-hidden="true" />
            <span {...g("list")}>1 kg ziemniaków</span>
          </li>
          <li>
            <span className={`check${picked === "check" ? " picked" : ""}`} data-group="check" aria-hidden="true" />
            <span {...g("list")}>2 jajka</span>
          </li>
        </ul>
        <ol className="steps">
          <li>
            <span className="step-number">1</span>
            <div {...g("body")}>
              <p>Smaż placki na złoto z obu stron.</p>
              <span className="timer-button">⏱ 5 min</span>
            </div>
          </li>
        </ol>
        <p className="muted small scale-preview-label">Tryb gotowania</p>
        <p className={`cooking-step${picked === "kitchen" ? " picked" : ""}`} data-group="kitchen">
          Smaż placki na złoto z obu stron.
        </p>
        <div className={`timer${picked === "timer" ? " picked" : ""}`} data-group="timer">
          <span className="timer-label">
            <small>Placki ziemniaczane</small>
            <b>krok 1: 5 min</b>
          </span>
          <strong className="timer-time">4:59</strong>
        </div>
      </div>
      <div className="scale-preview-bar" aria-live="polite">
        {pickedGroup ? (
          <>
            <span className="grow">
              {pickedGroup.label}
              <span className="muted small block">{pickedGroup.hint}</span>
            </span>
            {stepper(pickedGroup.key, "Podgląd")}
          </>
        ) : (
          <span className="muted small">Stuknij element w podglądzie, żeby zmienić jego wielkość (tło = odstępy).</span>
        )}
      </div>
      <ul className="scale-list">
        {SCALE_GROUPS.map((x) => (
          <li key={x.key} className={picked === x.key ? "picked" : undefined} onClick={() => setPicked(x.key)}>
            <span className="grow">
              {x.label}
              <span className="muted small block">{x.hint}</span>
            </span>
            {stepper(x.key, x.label)}
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
