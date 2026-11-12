import { CSSProperties, TouchEvent, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api, Recipe } from "../api";
import CookedSheet from "../components/recipe/CookedSheet";
import { useGoBack } from "../lib/navigation";
import { useCheckedSet, useSavedState } from "../lib/progress";
import { cachedRecipe } from "../lib/recipeCache";
import { scaleStep, scaleText } from "../lib/scale";
import { groupBySection } from "../lib/sections";
import { canSpeak, readAloudPreference, saveReadAloudPreference, speak, stopSpeaking } from "../lib/speech";
import { stepIngredients } from "../lib/stepIngredients";
import { findDurations } from "../lib/timers";
import { useTimers, useWakeLock } from "../lib/useTimers";

// Tryb gotowania: jeden krok na ekranie, duża czcionka, ekran nie gaśnie.
// 🔊 czyta kroki na głos (ręce w cieście) - każdy kolejny krok czyta się sam.
// Adres: /przepis/12/gotuj?skala=1.5 (skala = przeliczenie porcji z ekranu przepisu).
export default function CookingModePage() {
  const id = Number(useParams().id);
  const [params] = useSearchParams();
  const scale = Number(params.get("skala")) || 1;
  const goBack = useGoBack(`/przepis/${id}`);
  const [recipe, setRecipe] = useState<Recipe | null>(() => cachedRecipe(id) ?? null);
  const [error, setError] = useState("");
  // -1 = najpierw lista składników; krok jest zapamiętany, gdy iPhone zamknie aplikację w tle
  const [step, setStep] = useSavedState(`cooking-step-${id}`, -1);
  const { start } = useTimers();
  const [readAloud, setReadAloud] = useState(readAloudPreference);
  const [finishing, setFinishing] = useState(false);
  // Bez https Safari nie pozwala trzymać włączonego ekranu - mówimy o tym, zamiast udawać, że działa
  const [screenMaySleep, setScreenMaySleep] = useState(() => !("wakeLock" in navigator));
  useWakeLock(true, () => setScreenMaySleep(true));
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  // Te same odhaczone składniki co na ekranie przepisu
  const [checked, toggleChecked] = useCheckedSet(`checked-ingredients-${id}`);
  // Kierunek animacji kroku: do przodu wjeżdża z prawej, wstecz z lewej
  const [direction, setDirection] = useState(1);
  const go = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };

  useEffect(() => {
    api
      .getRecipe(id)
      .then(setRecipe)
      .catch((e) => !cachedRecipe(id) && setError(e.message));
  }, [id]);

  // Nowy krok (albo włączenie czytania) - czytamy go na głos
  const text = recipe && step >= 0 ? scaleStep(recipe.steps[step]?.text ?? "", scale) : "";
  useEffect(() => {
    if (readAloud && text) speak(`Krok ${step + 1}. ${text}`);
  }, [readAloud, text, step]);
  useEffect(() => stopSpeaking, []);

  const toggleReadAloud = () => {
    const on = !readAloud;
    setReadAloud(on);
    saveReadAloudPreference(on);
    if (!on) stopSpeaking();
  };

  if (error) return <p className="error center">{error}</p>;
  if (!recipe) return <p className="muted center">Ładowanie…</p>;

  const last = recipe.steps.length - 1;
  const current = step >= 0 ? recipe.steps[step] : null;
  // Składniki użyte w tym kroku - żeby nie wracać do listy
  const used = current ? stepIngredients(recipe.ingredients, [current.text])[0] : [];

  // Przesunięcie palcem w lewo = następny krok, w prawo = poprzedni
  const onTouchStart = (e: TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: TouchEvent) => {
    const from = touchStart.current;
    touchStart.current = null;
    if (!from) return;
    const dx = e.changedTouches[0].clientX - from.x;
    const dy = e.changedTouches[0].clientY - from.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0 && step < last) go(step + 1);
    if (dx > 0 && step >= 0) go(step - 1);
  };

  return (
    <div className="cooking">
      <header className="topbar">
        <button type="button" className="link" onClick={goBack}>
          ✕ Zakończ
        </button>
        <span className="muted small">{current ? `Krok ${step + 1} z ${recipe.steps.length}` : "Składniki"}</span>
        {canSpeak && (
          <button type="button" className={`link read-aloud ${readAloud ? "on" : ""}`} onClick={toggleReadAloud} aria-pressed={readAloud} aria-label="Czytaj kroki na głos">
            {readAloud ? "🔊" : "🔈"}
          </button>
        )}
      </header>

      {/* Postęp: kreska na każdy krok, widać z daleka, ile zostało */}
      <div className="cooking-progress" aria-hidden="true">
        {recipe.steps.map((_, i) => (
          <span key={i} className={i <= step ? "on" : ""} />
        ))}
      </div>
      <p className="wake-chip muted">
        {screenMaySleep ? `Ekran może gasnąć${window.isSecureContext ? "" : " – utrzyma go adres https"}` : "☀️ Ekran nie zgaśnie"}
      </p>
      <div className="cooking-body" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <h2>{recipe.title}</h2>
        {current ? (
          <>
            {current.section && <p className="section-title cooking-section">{current.section}</p>}
            {/* Stuknięcie w krok czyta go jeszcze raz */}
            <p key={step} className="cooking-step" style={{ "--from": `${direction * 24}px` } as CSSProperties} onClick={() => readAloud && speak(text)}>
              {text}
            </p>
            {used.length > 0 && (
              <ul className="step-ingredients">
                {used.map((i) => (
                  <li key={i}>{scaleText(recipe.ingredients[i].text, recipe.ingredients[i].amount, scale)}</li>
                ))}
              </ul>
            )}
            {findDurations(current.text).map((d, j) => (
              <button key={j} type="button" className="timer-button big" onClick={() => start(`${recipe.title}, krok ${step + 1}: ${d.label}`, d.seconds, recipe.id)}>
                ⏱ Minutnik {d.label}
              </button>
            ))}
            {current.image_url && <img src={current.image_url} alt="" />}
          </>
        ) : (
          // Przed startem: lista do odhaczenia "mam na blacie" - duże wiersze, cały wiersz do stuknięcia
          // Z sekcjami (np. "Omlet", "Krem") każdą część można przygotować osobno
          groupBySection(recipe.ingredients).map((group) => (
            <div key={group.items[0].index}>
              {group.section && <h3 className="section-title">{group.section}</h3>}
              <ul className="checklist cooking-ingredients">
                {group.items.map(({ item: ing, index: i }) => (
                  <li key={i} className={checked.has(i) ? "done" : ""} role="checkbox" aria-checked={checked.has(i)} tabIndex={0} onClick={() => toggleChecked(i)}>
                    <span className="check" aria-hidden="true" />
                    <span className="item-text">{scaleText(ing.text, ing.amount, scale)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      <div className="cooking-nav">
        <button type="button" disabled={step < 0} onClick={() => go(step - 1)}>
          ‹ Wstecz
        </button>
        {step < last ? (
          <button type="button" className="primary" onClick={() => go(step + 1)}>
            {step < 0 ? "Zaczynamy ›" : "Dalej ›"}
          </button>
        ) : (
          <button type="button" className="primary" onClick={() => setFinishing(true)}>
            ✅ Ugotowane
          </button>
        )}
      </div>
      {finishing && <CookedSheet recipe={recipe} onClose={() => setFinishing(false)} onSaved={goBack} />}
    </div>
  );
}
