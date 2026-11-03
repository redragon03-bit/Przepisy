import { useState } from "react";
import { Link } from "react-router-dom";
import { AiRecipe, api, formatMinutes } from "../api";
import { nutritionText } from "../lib/nutrition";

// Przepis wymyślony przez AI (czat, pomysły z promocji): podgląd i zapis jednym przyciskiem.
export default function NewRecipeCard({ recipe }: { recipe: AiRecipe }) {
  const [savedId, setSavedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      setSavedId((await api.saveChatRecipe(recipe)).id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const meta = [recipe.servings, formatMinutes(recipe.total_minutes), nutritionText(recipe)].filter(Boolean);
  return (
    <div className="box new-recipe">
      <strong>{recipe.title}</strong>
      {recipe.description && <p className="small">{recipe.description}</p>}
      {meta.length > 0 && <p className="muted small">{meta.join(" · ")}</p>}
      <details>
        <summary>Składniki i przygotowanie</summary>
        <ul>
          {recipe.ingredients.map((ing, i) => (
            <li key={i}>{ing.text}</li>
          ))}
        </ul>
        <ol>
          {recipe.steps.map((step, i) => (
            <li key={i}>{step.text}</li>
          ))}
        </ol>
      </details>
      {savedId ? (
        <Link to={`/przepis/${savedId}`} className="button wide">
          ✅ Zapisany - otwórz przepis
        </Link>
      ) : (
        <button type="button" className="primary wide" disabled={saving} onClick={save}>
          {saving ? "Zapisuję…" : "💾 Zapisz przepis"}
        </button>
      )}
      {error && <p className="error small">{error}</p>}
    </div>
  );
}
