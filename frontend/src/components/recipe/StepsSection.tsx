import { Link } from "react-router-dom";
import { Recipe } from "../../api";
import { useCheckedSet } from "../../lib/progress";
import { scaleStep } from "../../lib/scale";
import { findDurations } from "../../lib/timers";
import { useTimers } from "../../lib/useTimers";

// Kroki z odhaczaniem; czasy w krokach ("10 min") uruchamiają minutniki,
// a ilości ("200 g mąki") są przeliczane razem z porcjami.
export default function StepsSection({ recipe, scale }: { recipe: Recipe; scale: number }) {
  const [checked, toggle] = useCheckedSet(`checked-steps-${recipe.id}`);
  const { start } = useTimers();

  return (
    <>
      <h2>Przygotowanie</h2>
      {recipe.steps.length > 0 && (
        <Link to={`/przepis/${recipe.id}/gotuj?skala=${scale}`} className="button primary wide">
          👨‍🍳 Tryb gotowania (krok po kroku)
        </Link>
      )}
      <ol className="steps">
        {recipe.steps.map((step, i) => (
          <li key={i} className={checked.has(i) ? "done" : ""} onClick={() => toggle(i)}>
            <span className="step-number">{i + 1}</span>
            <div>
              <p>{scaleStep(step.text, scale)}</p>
              {findDurations(step.text).map((d, j) => (
                <button
                  key={j}
                  type="button"
                  className="timer-button"
                  onClick={(e) => {
                    e.stopPropagation(); // nie odhaczaj kroku
                    start(`${recipe.title}, krok ${i + 1}: ${d.label}`, d.seconds, recipe.id);
                  }}
                >
                  ⏱ {d.label}
                </button>
              ))}
              {step.image_url && <img src={step.image_url} alt="" loading="lazy" />}
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
