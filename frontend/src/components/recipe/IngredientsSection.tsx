import { useState } from "react";
import { Recipe } from "../../api";
import { useCheckedSet } from "../../lib/progress";
import { formatAmount, scaleText } from "../../lib/scale";
import { useLongPress } from "../../lib/useLongPress";
import SubstituteSheet from "./SubstituteSheet";

// Składniki z odhaczaniem i przeliczaniem porcji ("4 porcje" -> 6 porcji, albo mnożnik 2×).
// Przytrzymanie składnika pyta AI, czym go zastąpić.
export default function IngredientsSection({ recipe, baseServings, servings, setServings, factor, setFactor, scale, aiEnabled }: {
  recipe: Recipe;
  aiEnabled: boolean;
  baseServings: number | null;
  servings: number | null;
  setServings: (n: number) => void;
  factor: number;
  setFactor: (f: number) => void;
  scale: number;
}) {
  // Odhaczone składniki zostają po powrocie do aplikacji (patrz lib/progress.ts)
  const [checked, toggle] = useCheckedSet(`checked-ingredients-${recipe.id}`);
  const [showOriginal, setShowOriginal] = useState(false);
  const [substitute, setSubstitute] = useState<string | null>(null);
  const hasOriginal = recipe.ingredients.some((i) => i.original_text && i.original_text !== i.text);

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
          <IngredientRow
            key={i}
            text={scaleText(ing.text, ing.amount, scale)}
            original={showOriginal && ing.original_text && ing.original_text !== ing.text ? ing.original_text : ""}
            done={checked.has(i)}
            onToggle={() => toggle(i)}
            onLongPress={aiEnabled ? () => setSubstitute(ing.text) : undefined}
          />
        ))}
      </ul>
      {aiEnabled && recipe.ingredients.length > 0 && <p className="muted small hint">Brakuje czegoś? Przytrzymaj składnik.</p>}
      {substitute && <SubstituteSheet recipeId={recipe.id} ingredient={substitute} onClose={() => setSubstitute(null)} />}
      {hasOriginal && (
        <button type="button" className="link small" onClick={() => setShowOriginal(!showOriginal)}>
          {showOriginal ? "Ukryj oryginalne miary" : "Pokaż oryginalne miary"}
        </button>
      )}
    </>
  );
}

function IngredientRow({ text, original, done, onToggle, onLongPress }: {
  text: string;
  original: string;
  done: boolean;
  onToggle: () => void;
  onLongPress?: () => void;
}) {
  const { wasLongPress, ...longPress } = useLongPress(() => onLongPress?.());
  return (
    <li className={done ? "done" : ""} {...(onLongPress ? longPress : {})} onClick={() => !wasLongPress() && onToggle()}>
      <span className="box-icon">{done ? "☑" : "☐"}</span>
      <span>
        {text}
        {original && <span className="muted small"> ({original})</span>}
      </span>
    </li>
  );
}
