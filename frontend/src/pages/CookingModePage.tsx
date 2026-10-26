import { TouchEvent, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api, Recipe } from "../api";
import CookedSheet from "../components/recipe/CookedSheet";
import { useGoBack } from "../lib/navigation";
import { cachedRecipe } from "../lib/recipeCache";
import { scaleStep, scaleText } from "../lib/scale";
import { canSpeak, readAloudPreference, saveReadAloudPreference, speak, stopSpeaking } from "../lib/speech";
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
  const [step, setStep] = useState(-1); // -1 = najpierw lista składników
  const { start } = useTimers();
  const [readAloud, setReadAloud] = useState(readAloudPreference);
  const [finishing, setFinishing] = useState(false);
  useWakeLock(true);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

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
    if (dx < 0 && step < last) setStep(step + 1);
    if (dx > 0 && step >= 0) setStep(step - 1);
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

      <div className="cooking-body" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <h2>{recipe.title}</h2>
        {current ? (
          <>
            {/* Stuknięcie w krok czyta go jeszcze raz */}
            <p className="cooking-step" onClick={() => readAloud && speak(text)}>
              {text}
            </p>
            {findDurations(current.text).map((d, j) => (
              <button key={j} type="button" className="timer-button big" onClick={() => start(`${recipe.title}, krok ${step + 1}: ${d.label}`, d.seconds, recipe.id)}>
                ⏱ Minutnik {d.label}
              </button>
            ))}
            {current.image_url && <img src={current.image_url} alt="" />}
          </>
        ) : (
          <ul className="cooking-ingredients">
            {recipe.ingredients.map((ing, i) => (
              <li key={i}>{scaleText(ing.text, ing.amount, scale)}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="cooking-nav">
        <button type="button" disabled={step < 0} onClick={() => setStep(step - 1)}>
          ‹ Wstecz
        </button>
        {step < last ? (
          <button type="button" className="primary" onClick={() => setStep(step + 1)}>
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
