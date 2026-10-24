import { useState } from "react";
import { Recipe } from "../../api";
import { formatAmount, scaleText } from "../../lib/scale";

// Składniki z odhaczaniem i przeliczaniem porcji ("4 porcje" -> 6 porcji, albo mnożnik 2×)
export default function IngredientsSection({ recipe, baseServings, servings, setServings, factor, setFactor, scale }: {
  recipe: Recipe;
  baseServings: number | null;
  servings: number | null;
  setServings: (n: number) => void;
  factor: number;
  setFactor: (f: number) => void;
  scale: number;
}) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [showOriginal, setShowOriginal] = useState(false);
  const hasOriginal = recipe.ingredients.some((i) => i.original_text && i.original_text !== i.text);

  const toggle = (index: number) => {
    const next = new Set(checked);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setChecked(next);
  };

  return (
    <>
      <div className="row servings">
        <h2>Składniki</h2>
        {baseServings && servings ? (
          <span className="stepper">
            <button type="button" onClick={() => setServings(Math.max(1, servings - 1))} aria-label="Mniej porcji">
              −
            </button>
            {servings} {servings === 1 ? "porcja" : servings < 5 ? "porcje" : "porcji"}
            <button type="button" onClick={() => setServings(servings + 1)} aria-label="Więcej porcji">
              +
            </button>
          </span>
        ) : (
          <span className="stepper">
            {[0.5, 1, 2, 3].map((f) => (
              <button key={f} type="button" className={factor === f ? "active" : ""} onClick={() => setFactor(f)}>
                {formatAmount(f)}×
              </button>
            ))}
          </span>
        )}
      </div>
      <ul className="checklist">
        {recipe.ingredients.map((ing, i) => (
          <li key={i} className={checked.has(i) ? "done" : ""} onClick={() => toggle(i)}>
            <span className="box-icon">{checked.has(i) ? "☑" : "☐"}</span>
            <span>
              {scaleText(ing.text, ing.amount, scale)}
              {showOriginal && ing.original_text && ing.original_text !== ing.text && (
                <span className="muted small"> ({ing.original_text})</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {hasOriginal && (
        <button type="button" className="link small" onClick={() => setShowOriginal(!showOriginal)}>
          {showOriginal ? "Ukryj oryginalne miary" : "Pokaż oryginalne miary"}
        </button>
      )}
    </>
  );
}
