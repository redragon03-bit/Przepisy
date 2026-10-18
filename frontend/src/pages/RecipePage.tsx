import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, formatMinutes, Recipe } from "../api";

// Szczegóły przepisu. Składniki i kroki można "odhaczać" w trakcie gotowania.
export default function RecipePage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [showOriginal, setShowOriginal] = useState(false);
  const [keepAwake, setKeepAwake] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getRecipe(id).then(setRecipe).catch((e) => setError(e.message));
  }, [id]);

  // "Nie wygaszaj ekranu" - przydatne, gdy telefon leży w kuchni
  useEffect(() => {
    if (!keepAwake || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock.request("screen").then((l) => (lock = l)).catch(() => setKeepAwake(false));
    return () => {
      lock?.release();
    };
  }, [keepAwake]);

  if (error) return <p className="error center">{error}</p>;
  if (!recipe) return <p className="muted center">Ładowanie…</p>;

  const toggle = (key: string) => {
    const next = new Set(checked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setChecked(next);
  };

  const remove = async () => {
    if (!window.confirm(`Usunąć przepis „${recipe.title}”?`)) return;
    await api.deleteRecipe(recipe.id);
    navigate("/");
  };

  const changePhoto = async (file: File | undefined) => {
    if (file) setRecipe(await api.uploadRecipeImage(recipe.id, file));
  };

  const hasOriginal = recipe.ingredients.some((i) => i.original_text && i.original_text !== i.text);
  const times = [
    recipe.prep_minutes && `przygotowanie ${formatMinutes(recipe.prep_minutes)}`,
    recipe.cook_minutes && `gotowanie ${formatMinutes(recipe.cook_minutes)}`,
    recipe.total_minutes && `razem ${formatMinutes(recipe.total_minutes)}`,
  ].filter(Boolean);

  return (
    <article className="recipe">
      <header className="topbar">
        <button type="button" className="link" onClick={() => navigate(-1)}>
          ‹ Wróć
        </button>
        <Link to={`/przepis/${recipe.id}/edytuj`} className="button small">
          Edytuj
        </Link>
      </header>

      {recipe.image_url && <img className="hero" src={recipe.image_url} alt="" />}
      <h1>{recipe.title}</h1>
      {recipe.categories.length > 0 && (
        <div className="chips">
          {recipe.categories.map((c) => (
            <span key={c} className="chip">
              {c}
            </span>
          ))}
        </div>
      )}
      {recipe.description && <p>{recipe.description}</p>}
      <p className="muted small">
        {[recipe.servings, ...times].filter(Boolean).join(" · ")}
        {recipe.source_url && (
          <>
            {" · "}
            <a href={recipe.source_url} target="_blank" rel="noreferrer">
              źródło
            </a>
          </>
        )}
      </p>

      {"wakeLock" in navigator && (
        <label className="toggle">
          <input type="checkbox" checked={keepAwake} onChange={(e) => setKeepAwake(e.target.checked)} />
          Nie wygaszaj ekranu
        </label>
      )}

      <h2>Składniki</h2>
      <ul className="checklist">
        {recipe.ingredients.map((ing, i) => (
          <li key={i} className={checked.has(`i${i}`) ? "done" : ""} onClick={() => toggle(`i${i}`)}>
            <span className="box-icon">{checked.has(`i${i}`) ? "☑" : "☐"}</span>
            <span>
              {ing.text}
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

      <h2>Przygotowanie</h2>
      <ol className="steps">
        {recipe.steps.map((step, i) => (
          <li key={i} className={checked.has(`s${i}`) ? "done" : ""} onClick={() => toggle(`s${i}`)}>
            <span className="step-number">{i + 1}</span>
            <div>
              <p>{step.text}</p>
              {step.image_url && <img src={step.image_url} alt="" loading="lazy" />}
            </div>
          </li>
        ))}
      </ol>

      {recipe.notes && (
        <>
          <h2>Notatki</h2>
          <p className="notes">{recipe.notes}</p>
        </>
      )}

      <div className="actions">
        <button type="button" onClick={() => photoInput.current?.click()}>
          Zmień zdjęcie
        </button>
        <input ref={photoInput} type="file" accept="image/*" hidden onChange={(e) => changePhoto(e.target.files?.[0])} />
        <button type="button" className="danger" onClick={remove}>
          Usuń przepis
        </button>
      </div>
    </article>
  );
}
