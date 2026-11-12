import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, Recipe, RecipeSummary } from "../api";
import type { SectionsOut } from "../api-types";
import { forgetRecipe } from "../lib/recipeCache";
import { applyOrder, groupBySection, WithSection } from "../lib/sections";

// Przegląd sekcji we wszystkich przepisach: po lewej jak jest, po prawej propozycja AI,
// pod spodem "Pomiń" i "Akceptuj". Propozycję dla następnego przepisu AI liczy już
// w tle, żeby po stuknięciu nie trzeba było czekać.

// Pominięte przepisy pamiętamy w telefonie, żeby nie wracały przy kolejnym przeglądzie
const SKIPPED_KEY = "sections-skipped";

function loadSkipped(): number[] {
  try {
    return JSON.parse(localStorage.getItem(SKIPPED_KEY) ?? "[]") as number[];
  } catch {
    return [];
  }
}

function saveSkipped(ids: number[]) {
  try {
    localStorage.setItem(SKIPPED_KEY, JSON.stringify(ids));
  } catch {
    // tryb prywatny - trudno, pominięte wrócą następnym razem
  }
}

interface Proposal {
  recipe: Recipe;
  answer: SectionsOut;
}

export default function SectionsReviewPage() {
  const navigate = useNavigate();
  const [queue, setQueue] = useState<RecipeSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [current, setCurrent] = useState<Proposal | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Propozycje liczone z wyprzedzeniem (id przepisu -> obietnica)
  const pending = useRef(new Map<number, Promise<Proposal>>());

  const propose = useCallback((id: number) => {
    let promise = pending.current.get(id);
    if (!promise) {
      promise = Promise.all([api.getRecipe(id), api.suggestRecipeSections(id)]).then(([recipe, answer]) => ({ recipe, answer }));
      // Nieudaną próbę można powtórzyć
      promise.catch(() => pending.current.delete(id));
      pending.current.set(id, promise);
    }
    return promise;
  }, []);

  const load = useCallback(() => {
    setError("");
    setQueue(null);
    api.sectionsTodo().then(
      (list) => {
        const skipped = new Set(loadSkipped());
        const todo = list.filter((r) => !skipped.has(r.id));
        setQueue(todo);
        setTotal(todo.length);
        setDone(0);
      },
      (e: Error) => setError(e.message),
    );
  }, []);

  useEffect(load, [load]);

  // Pierwszy przepis z kolejki: czekamy na propozycję, a następny liczymy już w tle
  const first = queue?.[0]?.id;
  const second = queue?.[1]?.id;
  useEffect(() => {
    if (first === undefined) return;
    let active = true;
    setCurrent(null);
    setError("");
    propose(first).then(
      (p) => active && setCurrent(p),
      (e: Error) => active && setError(e.message || "AI nie odpowiedziało"),
    );
    if (second !== undefined) propose(second).catch(() => {});
    return () => {
      active = false;
    };
  }, [first, second, propose, attempt]);

  const next = () => {
    if (first !== undefined) pending.current.delete(first);
    setQueue((q) => (q ? q.slice(1) : q));
    setDone((d) => d + 1);
  };

  const skip = () => {
    if (first !== undefined) saveSkipped([...new Set([...loadSkipped(), first])]);
    next();
  };

  const accept = async () => {
    if (!current) return;
    setSaving(true);
    try {
      await api.applyRecipeSections(current.recipe.id, current.answer);
      forgetRecipe(current.recipe.id);
      next();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const resetSkipped = () => {
    saveSkipped([]);
    load();
  };

  const header = (
    <header className="topbar">
      <button type="button" className="link" onClick={() => navigate(-1)}>
        ‹ Wróć
      </button>
      <h1>Sekcje w przepisach</h1>
      {queue && total > 0 && (
        <span className="muted small">
          {Math.min(done + 1, total)} z {total}
        </span>
      )}
    </header>
  );

  if (!queue) {
    return (
      <div className="sections-review">
        {header}
        {error ? <p className="error">{error}</p> : <p className="muted center">Ładowanie…</p>}
      </div>
    );
  }

  if (queue.length === 0) {
    const skippedCount = loadSkipped().length;
    return (
      <div className="sections-review">
        {header}
        <p className="center">{done > 0 ? "✅ Wszystkie przejrzane." : "Nie ma przepisów bez sekcji do przejrzenia."}</p>
        {skippedCount > 0 && (
          <button type="button" className="wide" onClick={resetSkipped}>
            Przejrzyj jeszcze raz pominięte ({skippedCount})
          </button>
        )}
      </div>
    );
  }

  const summary = queue[0];
  const proposal = current && current.recipe.id === summary.id ? current : null;
  const after = proposal && {
    ingredients: applyOrder(proposal.recipe.ingredients, proposal.answer.ingredient_order, proposal.answer.ingredient_sections),
    steps: applyOrder(proposal.recipe.steps, proposal.answer.step_order, proposal.answer.step_sections),
  };
  const noChange =
    proposal &&
    proposal.answer.ingredient_sections.every((s) => !s) &&
    proposal.answer.step_sections.every((s) => !s) &&
    proposal.answer.step_order.every((from, i) => from === i);

  return (
    <div className="sections-review">
      {header}
      <h2>
        <Link to={`/przepis/${summary.id}`}>{summary.title}</Link>
      </h2>
      {error && <p className="error">{error}</p>}
      {noChange && <p className="muted small">AI nie widzi tu osobnych części – możesz pominąć.</p>}
      <div className="compare">
        <section>
          <h3 className="compare-title">Teraz</h3>
          {proposal ? <RecipeColumn ingredients={proposal.recipe.ingredients} steps={proposal.recipe.steps} /> : <p className="muted small">…</p>}
        </section>
        <section className="compare-after">
          <h3 className="compare-title">Propozycja AI</h3>
          {after && proposal ? (
            <RecipeColumn ingredients={after.ingredients} steps={after.steps} moved={proposal.answer.step_order} />
          ) : error ? (
            <button type="button" className="small" onClick={() => setAttempt((a) => a + 1)}>
              Spróbuj ponownie
            </button>
          ) : (
            <p className="muted small">AI dzieli przepis…</p>
          )}
        </section>
      </div>
      <div className="review-actions">
        <button type="button" onClick={skip} disabled={saving}>
          ✕ Pomiń
        </button>
        <button type="button" className="primary" onClick={accept} disabled={!proposal || saving || !!noChange}>
          {saving ? "Zapisuję…" : "✓ Akceptuj"}
        </button>
      </div>
    </div>
  );
}

// Jedna kolumna porównania: składniki i kroki z nagłówkami sekcji.
// moved: skąd przyszedł każdy krok (numer z "Teraz"); przeniesione kroki mają ↕
function RecipeColumn({ ingredients, steps, moved }: { ingredients: (WithSection & { text: string })[]; steps: (WithSection & { text: string })[]; moved?: number[] }) {
  return (
    <>
      <h4>Składniki</h4>
      {groupBySection(ingredients).map((g) => (
        <div key={g.items[0].index}>
          {g.section && <p className="section-title">{g.section}</p>}
          <ul>
            {g.items.map(({ item, index }) => (
              <li key={index}>{item.text}</li>
            ))}
          </ul>
        </div>
      ))}
      <h4>Kroki</h4>
      {groupBySection(steps).map((g) => (
        <div key={g.items[0].index}>
          {g.section && <p className="section-title">{g.section}</p>}
          <ol>
            {g.items.map(({ item, index }) => (
              <li key={index} value={index + 1} className={moved && moved[index] !== index ? "moved" : ""}>
                {moved && moved[index] !== index && <span aria-label="przeniesiony">↕ </span>}
                {item.text}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </>
  );
}
