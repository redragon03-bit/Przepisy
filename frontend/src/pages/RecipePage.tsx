import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, formatMinutes, isoDay, Recipe } from "../api";
import Stars from "../components/Stars";
import AutoTextarea from "../components/AutoTextarea";
import TimersBar from "../components/TimersBar";
import { useGoBack } from "../lib/navigation";
import { nutritionText } from "../lib/nutrition";
import { rememberRecipe } from "../lib/recent";
import { formatAmount, parseServings, scaleText } from "../lib/scale";
import { recipeAsText, shareText } from "../lib/share";
import { shoppingMessage } from "../lib/shopping";
import { findDurations } from "../lib/timers";
import { useTimers, useWakeLock } from "../lib/useTimers";

// Szczegóły przepisu. Składniki i kroki można "odhaczać" w trakcie gotowania,
// czasy w krokach uruchamiają minutniki, a porcje można przeliczyć.
export default function RecipePage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const goBack = useGoBack("/");
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [showOriginal, setShowOriginal] = useState(false);
  const [keepAwake, setKeepAwake] = useState(false);
  const [servings, setServings] = useState<number | null>(null);
  const [factor, setFactor] = useState(1);
  const { timers, now, start: startTimer, remove: removeTimer } = useTimers();
  const [calculating, setCalculating] = useState(false);
  const [planDay, setPlanDay] = useState("");
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<string[] | null>(null);
  const [searching, setSearching] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    api
      .getRecipe(id)
      .then((r) => {
        setRecipe(r);
        setServings(parseServings(r.servings));
        rememberRecipe(r.id);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  // "Nie wygaszaj ekranu" - przydatne, gdy telefon leży w kuchni
  useWakeLock(keepAwake, () => setKeepAwake(false));

  if (error) return <p className="error center">{error}</p>;
  if (!recipe) return <p className="muted center">Ładowanie…</p>;

  const baseServings = parseServings(recipe.servings);
  const scale = baseServings && servings ? servings / baseServings : factor;

  const toggle = (key: string) => {
    const next = new Set(checked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setChecked(next);
  };

  const flash = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(""), 3000);
  };

  const remove = async () => {
    if (!window.confirm(`Usunąć przepis „${recipe.title}”?`)) return;
    await api.deleteRecipe(recipe.id);
    navigate("/");
  };

  const changePhoto = async (file: File | undefined) => {
    if (file) setRecipe(await api.uploadRecipeImage(recipe.id, file));
  };

  const searchImages = async () => {
    setSearching(true);
    setCandidates(null);
    try {
      const found = await api.imageCandidates(recipe.id);
      setCandidates(found);
      if (!found.length) flash("Nie znalazłem pasujących zdjęć.");
    } catch (e) {
      flash((e as Error).message);
    } finally {
      setSearching(false);
    }
  };

  const pickImage = async (url: string) => {
    try {
      setRecipe(await api.setImageFromUrl(recipe.id, url));
      setCandidates(null);
    } catch (e) {
      flash((e as Error).message);
    }
  };

  const toShopping = async () => {
    flash(shoppingMessage(await api.addRecipeToShopping(recipe.id, scale)));
  };

  const calculateNutrition = async () => {
    setCalculating(true);
    try {
      setRecipe(await api.calculateNutrition(recipe.id));
    } catch (e) {
      flash((e as Error).message);
    } finally {
      setCalculating(false);
    }
  };

  const share = async () => {
    const text = recipeAsText({
      ...recipe,
      ingredients: recipe.ingredients.map((i) => scaleText(i.text, i.amount, scale)),
      steps: recipe.steps.map((s) => s.text),
      servings: baseServings && servings ? `${servings} porcje` : recipe.servings,
    });
    const result = await shareText(recipe.title, text);
    if (result) flash(result);
  };

  const plan = async () => {
    if (!planDay) return;
    await api.addToPlan(planDay, recipe.id);
    flash(`Zaplanowano na ${new Date(`${planDay}T12:00`).toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" })}.`);
    setPlanDay("");
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
        <button type="button" className="link" onClick={goBack}>
          ‹ Wróć
        </button>
        <button
          type="button"
          className="link favorite"
          aria-label={recipe.favorite ? "Usuń z ulubionych" : "Dodaj do ulubionych"}
          onClick={async () => setRecipe(await api.patchRecipe(recipe.id, { favorite: !recipe.favorite }))}
        >
          {recipe.favorite ? "❤️" : "🤍"}
        </button>
        <Link to={`/przepis/${recipe.id}/edytuj`} className="button small">
          Edytuj
        </Link>
      </header>

      {recipe.image_url ? (
        <img className="hero" src={recipe.image_url} alt="" />
      ) : (
        <button type="button" className="hero-placeholder" disabled={searching} onClick={searchImages}>
          {searching ? "Szukam zdjęć w internecie…" : "🔍 Znajdź zdjęcie w internecie"}
        </button>
      )}
      {candidates && candidates.length > 0 && (
        <section className="box">
          <p className="small muted">Stuknij zdjęcie, które pasuje:</p>
          <div className="candidates">
            {candidates.map((url) => (
              <button key={url} type="button" onClick={() => pickImage(url)}>
                <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" />
              </button>
            ))}
          </div>
          <button type="button" className="link small" onClick={() => setCandidates(null)}>
            Żadne nie pasuje
          </button>
        </section>
      )}
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
      <Stars value={recipe.rating} onChange={async (rating) => setRecipe(await api.patchRecipe(recipe.id, { rating }))} />
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
      {recipe.kcal !== null ? (
        <p className="small">
          {nutritionText(recipe)} <span className="muted">na porcję (szacunek AI)</span>
        </p>
      ) : (
        <button type="button" className="link small" disabled={calculating} onClick={calculateNutrition}>
          {calculating ? "Liczę kalorie…" : "🔥 Policz kalorie i makro"}
        </button>
      )}
      {recipe.cooked_count > 0 && (
        <p className="muted small">
          Ugotowane {recipe.cooked_count}× · ostatnio {new Date(recipe.last_cooked_at!).toLocaleDateString("pl-PL")}
        </p>
      )}

      {"wakeLock" in navigator && (
        <label className="toggle">
          <input type="checkbox" checked={keepAwake} onChange={(e) => setKeepAwake(e.target.checked)} />
          Nie wygaszaj ekranu
        </label>
      )}

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
          <li key={i} className={checked.has(`i${i}`) ? "done" : ""} onClick={() => toggle(`i${i}`)}>
            <span className="box-icon">{checked.has(`i${i}`) ? "☑" : "☐"}</span>
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
      <button type="button" className="wide" onClick={toShopping}>
        🛒 Do listy zakupów
      </button>

      <h2>Przygotowanie</h2>
      {recipe.steps.length > 0 && (
        <Link to={`/przepis/${recipe.id}/gotuj?skala=${scale}`} className="button primary wide">
          👨‍🍳 Tryb gotowania (krok po kroku)
        </Link>
      )}
      <ol className="steps">
        {recipe.steps.map((step, i) => (
          <li key={i} className={checked.has(`s${i}`) ? "done" : ""} onClick={() => toggle(`s${i}`)}>
            <span className="step-number">{i + 1}</span>
            <div>
              <p>{step.text}</p>
              {findDurations(step.text).map((d, j) => (
                <button
                  key={j}
                  type="button"
                  className="timer-button"
                  onClick={(e) => {
                    e.stopPropagation(); // nie odhaczaj kroku
                    startTimer(`Krok ${i + 1}: ${d.label}`, d.seconds);
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

      <h2>Notatki</h2>
      {editingNotes === null ? (
        <>
          {recipe.notes ? <p className="notes">{recipe.notes}</p> : <p className="muted small">Brak notatek.</p>}
          <button type="button" className="link small" onClick={() => setEditingNotes(recipe.notes)}>
            {recipe.notes ? "Edytuj notatki" : "+ Dodaj notatkę, np. „następnym razem mniej cukru”"}
          </button>
        </>
      ) : (
        <>
          <AutoTextarea rows={3} value={editingNotes} onChange={(e) => setEditingNotes(e.target.value)} autoFocus />
          <button
            type="button"
            className="primary"
            onClick={async () => {
              setRecipe(await api.patchRecipe(recipe.id, { notes: editingNotes }));
              setEditingNotes(null);
            }}
          >
            Zapisz notatkę
          </button>
        </>
      )}

      <div className="actions">
        <button
          type="button"
          className="primary"
          onClick={async () => {
            setRecipe(await api.markCooked(recipe.id));
            flash("Zapisane! Smacznego 🙂");
          }}
        >
          ✅ Ugotowane
        </button>
        <div className="row">
          <input type="date" value={planDay} min={isoDay(new Date())} onChange={(e) => setPlanDay(e.target.value)} aria-label="Dzień planu" />
          <button type="button" disabled={!planDay} onClick={plan}>
            📅 Zaplanuj
          </button>
        </div>
        <button type="button" onClick={share}>
          📤 Udostępnij przepis
        </button>
        {recipe.kcal !== null && (
          <button type="button" disabled={calculating} onClick={calculateNutrition}>
            {calculating ? "Liczę…" : "🔥 Policz kalorie ponownie"}
          </button>
        )}
        <button type="button" onClick={() => photoInput.current?.click()}>
          Zmień zdjęcie
        </button>
        {recipe.image_url && (
          <button type="button" disabled={searching} onClick={searchImages}>
            {searching ? "Szukam…" : "🔍 Znajdź inne zdjęcie w internecie"}
          </button>
        )}
        <input ref={photoInput} type="file" accept="image/*" hidden onChange={(e) => changePhoto(e.target.files?.[0])} />
        <button type="button" className="danger" onClick={remove}>
          Usuń przepis
        </button>
      </div>

      {message && <div className="toast">{message}</div>}

      <TimersBar timers={timers} now={now} onClose={removeTimer} />
    </article>
  );
}
