import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, Recipe } from "../api";
import TimersBar from "../components/TimersBar";
import { scaleText } from "../lib/scale";
import { findDurations } from "../lib/timers";
import { useTimers, useWakeLock } from "../lib/useTimers";

// Tryb gotowania: jeden krok na ekranie, duża czcionka, ekran nie gaśnie.
// Adres: /przepis/12/gotuj?skala=1.5 (skala = przeliczenie porcji z ekranu przepisu).
export default function CookingModePage() {
  const id = Number(useParams().id);
  const [params] = useSearchParams();
  const scale = Number(params.get("skala")) || 1;
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState("");
  const [step, setStep] = useState(-1); // -1 = najpierw lista składników
  const { timers, now, start, remove } = useTimers();
  useWakeLock(true);

  useEffect(() => {
    api.getRecipe(id).then(setRecipe).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <p className="error center">{error}</p>;
  if (!recipe) return <p className="muted center">Ładowanie…</p>;

  const last = recipe.steps.length - 1;
  const current = step >= 0 ? recipe.steps[step] : null;

  return (
    <div className="cooking">
      <header className="topbar">
        <button type="button" className="link" onClick={() => navigate(-1)}>
          ✕ Zakończ
        </button>
        <span className="muted small">{current ? `Krok ${step + 1} z ${recipe.steps.length}` : "Składniki"}</span>
      </header>

      <div className="cooking-body">
        <h2>{recipe.title}</h2>
        {current ? (
          <>
            <p className="cooking-step">{current.text}</p>
            {findDurations(current.text).map((d, j) => (
              <button key={j} type="button" className="timer-button big" onClick={() => start(`Krok ${step + 1}: ${d.label}`, d.seconds)}>
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
          <button
            type="button"
            className="primary"
            onClick={async () => {
              await api.markCooked(recipe.id);
              navigate(-1);
            }}
          >
            ✅ Ugotowane
          </button>
        )}
      </div>

      <TimersBar timers={timers} now={now} onClose={remove} />
    </div>
  );
}
