import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, formatMinutes, Recipe } from "../api";
import CookedSheet from "../components/recipe/CookedSheet";
import CookLogSheet from "../components/recipe/CookLogSheet";
import ImageCandidates from "../components/recipe/ImageCandidates";
import IngredientsSection from "../components/recipe/IngredientsSection";
import NotesSection from "../components/recipe/NotesSection";
import RecipeMenu from "../components/recipe/RecipeMenu";
import StepsSection from "../components/recipe/StepsSection";
import Stars from "../components/Stars";
import { useGoBack } from "../lib/navigation";
import { nutritionText } from "../lib/nutrition";
import { currentRandom, pickRandom, RandomState } from "../lib/random";
import { rememberRecipe } from "../lib/recent";
import { cachedRecipe, cacheRecipe } from "../lib/recipeCache";
import { parseServings } from "../lib/scale";
import { useToast } from "../lib/toast";
import { useWakeLock } from "../lib/useTimers";

// Szczegóły przepisu. Składniki i kroki można "odhaczać" w trakcie gotowania,
// czasy w krokach uruchamiają minutniki, a porcje można przeliczyć.
// Rzadziej używane akcje są w menu "⋯" (RecipeMenu).
export default function RecipePage({ aiEnabled }: { aiEnabled: boolean }) {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const goBack = useGoBack("/");
  const { toast, run } = useToast();
  // Przepis wylosowany kostką na liście - można losować dalej
  const random: RandomState | undefined = useLocation().state?.random;
  // Przepis otwarty niedawno pokazujemy od razu z pamięci, świeży przychodzi w tle
  const [recipe, setRecipeState] = useState<Recipe | null>(() => cachedRecipe(id) ?? null);
  const [error, setError] = useState("");
  const [keepAwake, setKeepAwake] = useState(false);
  const [servings, setServings] = useState<number | null>(() => parseServings(cachedRecipe(id)?.servings ?? ""));
  const [factor, setFactor] = useState(1);
  const [candidates, setCandidates] = useState<string[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [panel, setPanel] = useState<"cooked" | "log" | null>(null);

  const setRecipe = (r: Recipe) => {
    cacheRecipe(r);
    setRecipeState(r);
  };

  useEffect(() => {
    window.scrollTo(0, 0);
    const cached = cachedRecipe(id);
    setRecipeState(cached ?? null);
    setServings(parseServings(cached?.servings ?? ""));
    setFactor(1);
    setCandidates(null);
    setPanel(null);
    api
      .getRecipe(id)
      .then((r) => {
        setRecipe(r);
        if (!cached) setServings(parseServings(r.servings));
        rememberRecipe(r.id);
      })
      .catch((e) => {
        if (!cached) setError(e.message);
      });
  }, [id]);

  // "Nie wygaszaj ekranu" - przydatne, gdy telefon leży w kuchni
  useWakeLock(keepAwake, () => setKeepAwake(false));

  if (error) return <p className="error center">{error}</p>;
  if (!recipe) return <p className="muted center">Ładowanie…</p>;

  const baseServings = parseServings(recipe.servings);
  const scale = baseServings && servings ? servings / baseServings : factor;

  const searchImages = async () => {
    setSearching(true);
    setCandidates(null);
    const found = await run(() => api.imageCandidates(recipe.id));
    setSearching(false);
    if (found) {
      setCandidates(found);
      if (!found.length) toast("Nie znalazłem pasujących zdjęć.");
    }
  };

  const patch = async (data: { favorite?: boolean; rating?: number }) => {
    const saved = await run(() => api.patchRecipe(recipe.id, data));
    if (saved) setRecipe(saved);
  };

  // Przepis główny i jego warianty (np. "wege") - przełączanie jednym stuknięciem
  const family = recipe.variant_of
    ? [{ ...recipe.variant_of, variant_name: "oryginał" }, { id: recipe.id, title: recipe.title, variant_name: recipe.variant_name }, ...recipe.variants]
    : recipe.variants.length
      ? [{ id: recipe.id, title: recipe.title, variant_name: "oryginał" }, ...recipe.variants]
      : [];

  const times = [
    recipe.prep_minutes && `przygotowanie ${formatMinutes(recipe.prep_minutes)}`,
    recipe.cook_minutes && `gotowanie ${formatMinutes(recipe.cook_minutes)}`,
    recipe.total_minutes && `razem ${formatMinutes(recipe.total_minutes)}`,
  ].filter(Boolean);

  return (
    <article className="recipe">
      <header className="topbar">
        <button type="button" className="link" onClick={goBack}>
          ‹ Wróć
        </button>
        {random && random.pool.length > 1 && (
          <button
            type="button"
            className="button small"
            onClick={() => {
              const next = pickRandom(random);
              navigate(`/przepis/${currentRandom(next)}`, { replace: true, state: { random: next } });
            }}
          >
            🎲 Inny
          </button>
        )}
        <span className="grow" />
        <button
          type="button"
          className="link favorite"
          aria-label={recipe.favorite ? "Usuń z ulubionych" : "Dodaj do ulubionych"}
          onClick={() => patch({ favorite: !recipe.favorite })}
        >
          {recipe.favorite ? "❤️" : "🤍"}
        </button>
        <RecipeMenu
          recipe={recipe}
          scale={scale}
          servings={baseServings && servings ? `${servings} porcje` : recipe.servings}
          onChange={setRecipe}
          onSearchImages={searchImages}
          aiEnabled={aiEnabled}
        />
      </header>

      {recipe.image_url ? (
        <img className="hero" src={recipe.image_url} alt="" />
      ) : (
        <button type="button" className="hero-placeholder" disabled={searching} onClick={searchImages}>
          {searching ? "Szukam zdjęć w internecie…" : "🔍 Znajdź zdjęcie w internecie"}
        </button>
      )}
      {searching && recipe.image_url && <p className="muted small">Szukam zdjęć w internecie…</p>}
      {candidates && candidates.length > 0 && (
        <ImageCandidates
          recipe={recipe}
          urls={candidates}
          onPicked={(r) => {
            setRecipe(r);
            setCandidates(null);
          }}
          onClose={() => setCandidates(null)}
        />
      )}
      <h1>{recipe.title}</h1>
      {family.length > 0 && (
        <div className="chips variants">
          {family.map((v) =>
            v.id === recipe.id ? (
              <span key={v.id} className="chip selected">
                {v.variant_name}
              </span>
            ) : (
              <Link key={v.id} to={`/przepis/${v.id}`} replace className="chip">
                {v.variant_name}
              </Link>
            ),
          )}
        </div>
      )}
      {recipe.categories.length > 0 && (
        <div className="chips">
          {recipe.categories.map((c) => (
            <span key={c} className="chip">
              {c}
            </span>
          ))}
        </div>
      )}
      <Stars value={recipe.rating} onChange={(rating) => patch({ rating })} />
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
      {recipe.kcal !== null && (
        <p className="small">
          {nutritionText(recipe)} <span className="muted">na porcję (szacunek AI)</span>
        </p>
      )}
      {recipe.cooked_count > 0 && (
        <button type="button" className="link muted small cooked-line" onClick={() => setPanel("log")}>
          Ugotowane {recipe.cooked_count}× · ostatnio {new Date(recipe.last_cooked_at!).toLocaleDateString("pl-PL")}
          {recipe.cook_log.length > 0 && " · dziennik ›"}
        </button>
      )}

      {"wakeLock" in navigator && (
        <label className="toggle">
          <input type="checkbox" checked={keepAwake} onChange={(e) => setKeepAwake(e.target.checked)} />
          Nie wygaszaj ekranu
        </label>
      )}

      <IngredientsSection
        recipe={recipe}
        baseServings={baseServings}
        servings={servings}
        setServings={setServings}
        factor={factor}
        setFactor={setFactor}
        scale={scale}
        aiEnabled={aiEnabled}
      />
      <StepsSection recipe={recipe} scale={scale} />
      <NotesSection recipe={recipe} onChange={setRecipe} />

      <div className="actions">
        <button type="button" className="primary" onClick={() => setPanel("cooked")}>
          ✅ Ugotowane
        </button>
      </div>
      {panel === "cooked" && (
        <CookedSheet
          recipe={recipe}
          onClose={() => setPanel(null)}
          onSaved={(r) => {
            setRecipe(r);
            setPanel(null);
          }}
        />
      )}
      {panel === "log" && <CookLogSheet recipe={recipe} onChange={setRecipe} onClose={() => setPanel(null)} />}
    </article>
  );
}
