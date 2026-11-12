import { Link } from "react-router-dom";
import { Recipe } from "../../api";
import { useCheckedSet } from "../../lib/progress";
import { scaleStep } from "../../lib/scale";
import { groupBySection } from "../../lib/sections";
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
      {/* Pływający przycisk (FAB): zawsze pod kciukiem, także po przewinięciu do kroków.
          Gdy chodzi minutnik, zwija się do samej ikony obok niego (styles.css: .fab). */}
      {recipe.steps.length > 0 && (
        <Link to={`/przepis/${recipe.id}/gotuj?skala=${scale}`} className="fab" aria-label="Tryb gotowania (krok po kroku)">
          <span aria-hidden="true">👨‍🍳</span>
          <span className="fab-label">Gotuj</span>
        </Link>
      )}
      {groupBySection(recipe.steps).map((group) => (
        <div key={group.items[0].index}>
          {group.section && <h3 className="section-title">{group.section}</h3>}
          <ol className="steps">
            {group.items.map(({ item: step, index: i }) => (
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
        </div>
      ))}
    </>
  );
}
