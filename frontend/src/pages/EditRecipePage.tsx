import { ClipboardEvent, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, Category, IngredientLine, Recipe, RecipeInput } from "../api";
import type { StepIn } from "../api-types";
import AutoTextarea from "../components/AutoTextarea";
import { cachedRecipe, forgetRecipe } from "../lib/recipeCache";
import { applyOrder, fromRows, isHeading, Row, toRows } from "../lib/sections";
import { useReorder } from "../lib/useReorder";

// Formularz: składniki i kroki jako wiersze, wśród których są nagłówki sekcji
type EditForm = Omit<RecipeInput, "ingredients" | "steps"> & {
  ingredients: Row<IngredientLine>[];
  steps: Row<StepIn>[];
};

const EMPTY: EditForm = {
  title: "",
  description: "",
  servings: "",
  prep_minutes: null,
  cook_minutes: null,
  total_minutes: null,
  source_url: "",
  notes: "",
  ingredients: [],
  steps: [],
  categories: [],
};

const emptyIngredient = (): IngredientLine => ({ text: "", name: "", amount: null, unit: "", original_text: "", section: "" });

// Formularz dodawania (adres /nowy) i edycji (/przepis/:id/edytuj) przepisu.
export default function EditRecipePage({ aiEnabled = false }: { aiEnabled?: boolean }) {
  const params = useParams();
  const id = params.id ? Number(params.id) : null;
  const navigate = useNavigate();
  const [form, setForm] = useState<EditForm | null>(
    id ? null : { ...EMPTY, ingredients: [{ item: emptyIngredient() }], steps: [{ item: { text: "", image: null } }] },
  );
  const [sectioning, setSectioning] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [newCategory, setNewCategory] = useState("");
  // Formularz tuż po wczytaniu - żeby "Anuluj" pytał tylko wtedy, gdy coś zmieniono
  const initial = useRef(form ? JSON.stringify(form) : "");

  useEffect(() => {
    api.listCategories().then(setAllCategories, () => {});
  }, []);

  // Licznik prób wczytania - "Spróbuj ponownie" po błędzie zwiększa go i wczytuje jeszcze raz
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!id) return;
    let active = true;
    const toForm = (r: Recipe): EditForm => ({
      title: r.title,
      description: r.description,
      servings: r.servings,
      prep_minutes: r.prep_minutes,
      cook_minutes: r.cook_minutes,
      total_minutes: r.total_minutes,
      source_url: r.source_url,
      notes: r.notes,
      ingredients: toRows(r.ingredients),
      steps: toRows(r.steps.map((s, i) => ({ text: s.text, image: r.step_images?.[i] ?? null, section: s.section }))),
      categories: r.categories,
    });
    // Przepis zapamiętany w telefonie pokazujemy od razu (jak ekran przepisu), świeży z serwera podmieniamy w tle
    const cached = cachedRecipe(id);
    let shown = cached ? JSON.stringify(toForm(cached)) : "";
    if (cached) {
      initial.current = shown;
      setForm(toForm(cached));
    }
    setError("");
    api
      .getRecipe(id)
      .then((r) => {
        if (!active) return;
        const loaded = toForm(r);
        // Nie nadpisujemy tego, co ktoś zdążył już zmienić w formularzu
        setForm((current) => {
          if (current && JSON.stringify(current) !== shown) return current;
          shown = JSON.stringify(loaded);
          initial.current = shown;
          return loaded;
        });
      })
      .catch((e: Error) => {
        // Wcześniej błąd (np. "Load failed" po powrocie z galerii zdjęć) zostawiał wieczne "Ładowanie…"
        if (active && !cached) setError(e.message || "Nie udało się wczytać przepisu.");
      });
    return () => {
      active = false;
    };
  }, [id, attempt]);

  const ingredientOrder = useReorder(form?.ingredients ?? [], (ingredients) => form && setForm({ ...form, ingredients }));
  const stepOrder = useReorder(form?.steps ?? [], (steps) => form && setForm({ ...form, steps }));

  if (!form)
    return error ? (
      <div className="center">
        <p className="error">{error}</p>
        <button type="button" onClick={() => setAttempt(attempt + 1)}>
          Spróbuj ponownie
        </button>
      </div>
    ) : (
      <p className="muted center">Ładowanie…</p>
    );

  const cancel = () => {
    if (JSON.stringify(form) !== initial.current && !window.confirm("Odrzucić zmiany w przepisie?")) return;
    navigate(-1);
  };

  // Wklejenie kilku linijek (np. listy z kartki albo strony) robi z nich osobne składniki
  const pasteIngredients = (index: number, e: ClipboardEvent<HTMLTextAreaElement>) => {
    const lines = e.clipboardData
      .getData("text")
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*[-•*–]\s*/, "").trim())
      .filter(Boolean);
    if (lines.length < 2) return;
    e.preventDefault();
    const row = form.ingredients[index];
    if (isHeading(row)) return;
    const pasted = lines.map((text, i) => ({ item: i === 0 ? { ...row.item, text } : { ...emptyIngredient(), text } }));
    set("ingredients", [...form.ingredients.slice(0, index), ...pasted, ...form.ingredients.slice(index + 1)]);
  };

  const set = <K extends keyof EditForm>(key: K, value: EditForm[K]) => setForm({ ...form, [key]: value });
  const minutes = (value: string) => (value ? Number(value) : null);

  const setIngredient = (index: number, patch: Partial<IngredientLine>) =>
    set("ingredients", form.ingredients.map((row, i) => (i === index && !isHeading(row) ? { item: { ...row.item, ...patch } } : row)));
  const setStep = (index: number, text: string) =>
    set("steps", form.steps.map((row, i) => (i === index && !isHeading(row) ? { item: { ...row.item, text } } : row)));
  const setHeading = (key: "ingredients" | "steps", index: number, heading: string) =>
    set(key, form[key].map((row, i) => (i === index ? { heading } : row)) as never);
  const removeRow = (key: "ingredients" | "steps", index: number) =>
    set(key, form[key].filter((_, j) => j !== index) as never);
  // Nowa sekcja na końcu listy, od razu z pustym składnikiem/krokiem pod spodem
  const addSection = (key: "ingredients" | "steps") =>
    set(key, [...form[key], { heading: "" }, { item: key === "ingredients" ? emptyIngredient() : { text: "", image: null } }] as never);

  // AI proponuje sekcje (i kolejność kroków) dla tego, co jest w formularzu - zapis dopiero po "Zapisz"
  const suggestSections = async () => {
    const ingredients = fromRows(form.ingredients).filter((i) => i.text.trim());
    const steps = fromRows(form.steps).filter((s) => s.text.trim());
    setSectioning(true);
    setError("");
    try {
      const answer = await api.suggestSections({ title: form.title, ingredients: ingredients.map((i) => i.text), steps: steps.map((s) => s.text) });
      setForm({
        ...form,
        ingredients: toRows(applyOrder(ingredients, answer.ingredient_order, answer.ingredient_sections)),
        steps: toRows(applyOrder(steps, answer.step_order, answer.step_sections)),
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSectioning(false);
    }
  };

  const toggleCategory = (name: string) =>
    set("categories", form.categories.includes(name) ? form.categories.filter((c) => c !== name) : [...form.categories, name]);
  const addCategory = () => {
    const name = newCategory.trim();
    if (name && !form.categories.includes(name)) set("categories", [...form.categories, name]);
    setNewCategory("");
  };
  // Kategorie z bazy + nowe, wpisane w tym formularzu
  const categoryOptions = [...new Set([...allCategories.map((c) => c.name), ...form.categories])];

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const data: RecipeInput = { ...form, ingredients: fromRows(form.ingredients), steps: fromRows(form.steps) };
      const saved = id ? await api.updateRecipe(id, data) : await api.createRecipe(data);
      forgetRecipe(saved.id);
      navigate(`/przepis/${saved.id}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <form className="edit" onSubmit={save}>
      <header className="topbar">
        <button type="button" className="link" onClick={cancel}>
          Anuluj
        </button>
        <h1>{id ? "Edycja" : "Nowy przepis"}</h1>
        <button className="primary small" disabled={saving}>
          Zapisz
        </button>
      </header>
      {error && <p className="error">{error}</p>}

      <label>
        Nazwa
        <input required value={form.title} onChange={(e) => set("title", e.target.value)} />
      </label>
      <label>
        Opis
        <AutoTextarea rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} />
      </label>
      <div className="row">
        <label>
          Porcje
          <input value={form.servings} onChange={(e) => set("servings", e.target.value)} placeholder="np. 4 porcje" />
        </label>
        <label>
          Czas razem (min)
          <input type="number" inputMode="numeric" value={form.total_minutes ?? ""} onChange={(e) => set("total_minutes", minutes(e.target.value))} />
        </label>
      </div>

      <h2>Kategorie</h2>
      <div className="chips">
        {categoryOptions.map((name) => (
          <button key={name} type="button" className={`chip ${form.categories.includes(name) ? "selected" : ""}`} onClick={() => toggleCategory(name)}>
            {name}
          </button>
        ))}
      </div>
      <div className="row">
        <input
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCategory();
            }
          }}
          placeholder="Nowa kategoria"
        />
        <button type="button" onClick={addCategory} disabled={!newCategory.trim()}>
          Dodaj
        </button>
      </div>

      <h2>Składniki</h2>
      <p className="muted small">
        Druga kolumna to nazwa do wyszukiwania, np. „mąka pszenna” dla „200 g mąki pszennej”. Kolejność zmienisz, przeciągając za ⠿. Wklejenie kilku
        linijek doda kilka składników. Sekcja (np. „Krem”) obejmuje wszystko pod nią, aż do następnej.
      </p>
      {aiEnabled && (
        <button type="button" className="link small" onClick={suggestSections} disabled={sectioning}>
          {sectioning ? "AI dzieli przepis na sekcje…" : "✨ Podziel składniki i kroki na sekcje (AI)"}
        </button>
      )}
      {form.ingredients.map((row, i) =>
        isHeading(row) ? (
          <SectionRow
            key={i}
            reorder={ingredientOrder}
            index={i}
            value={row.heading}
            onChange={(v) => setHeading("ingredients", i, v)}
            onRemove={() => removeRow("ingredients", i)}
          />
        ) : (
          <div key={i} ref={ingredientOrder.rowRef(i)} className={`row ingredient-row ${ingredientOrder.dragging === i ? "dragging" : ""}`}>
            <span className="drag-handle" aria-label="Przeciągnij, żeby zmienić kolejność" {...ingredientOrder.handle(i)}>
              ⠿
            </span>
            <AutoTextarea
              singleLine
              value={row.item.text}
              onChange={(e) => setIngredient(i, { text: e.target.value.replace(/\n/g, " ") })}
              onPaste={(e) => pasteIngredients(i, e)}
              placeholder="200 g mąki pszennej"
            />
            <AutoTextarea
              singleLine
              value={row.item.name}
              onChange={(e) => setIngredient(i, { name: e.target.value.replace(/\n/g, " ") })}
              placeholder="mąka pszenna"
              autoCapitalize="none"
            />
            <button type="button" className="icon" onClick={() => removeRow("ingredients", i)} aria-label="Usuń">
              ✕
            </button>
          </div>
        ),
      )}
      <div className="row add-buttons">
        <button type="button" onClick={() => set("ingredients", [...form.ingredients, { item: emptyIngredient() }])}>
          + Składnik
        </button>
        <button type="button" onClick={() => addSection("ingredients")}>
          + Sekcja
        </button>
      </div>

      <h2>Kroki</h2>
      <p className="muted small">Kolejność zmienisz, przeciągając za numer kroku albo ⠿ przy sekcji.</p>
      {form.steps.map((row, i) =>
        isHeading(row) ? (
          <SectionRow
            key={i}
            reorder={stepOrder}
            index={i}
            value={row.heading}
            onChange={(v) => setHeading("steps", i, v)}
            onRemove={() => removeRow("steps", i)}
          />
        ) : (
          <div key={i} ref={stepOrder.rowRef(i)} className={`row step-row ${stepOrder.dragging === i ? "dragging" : ""}`}>
            <span className="step-number drag-handle" aria-label="Przeciągnij, żeby zmienić kolejność" {...stepOrder.handle(i)}>
              {form.steps.slice(0, i + 1).filter((r) => !isHeading(r)).length}
            </span>
            <AutoTextarea rows={2} value={row.item.text} onChange={(e) => setStep(i, e.target.value)} />
            <button type="button" className="icon" onClick={() => removeRow("steps", i)} aria-label="Usuń">
              ✕
            </button>
          </div>
        ),
      )}
      <div className="row add-buttons">
        <button type="button" onClick={() => set("steps", [...form.steps, { item: { text: "", image: null } }])}>
          + Krok
        </button>
        <button type="button" onClick={() => addSection("steps")}>
          + Sekcja
        </button>
      </div>

      <h2>Pozostałe</h2>
      <label>
        Link do źródła
        <input value={form.source_url} onChange={(e) => set("source_url", e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      </label>
      <label>
        Notatki
        <AutoTextarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="np. następnym razem mniej cukru" />
      </label>
    </form>
  );
}

// Nagłówek sekcji w formularzu: ⠿ do przeciągania, nazwa i ✕ (składniki/kroki pod nim zostają)
function SectionRow({ reorder, index, value, onChange, onRemove }: {
  reorder: ReturnType<typeof useReorder<unknown>>;
  index: number;
  value: string;
  onChange: (value: string) => void;
  onRemove: () => void;
}) {
  return (
    <div ref={reorder.rowRef(index)} className={`row section-row ${reorder.dragging === index ? "dragging" : ""}`}>
      <span className="drag-handle" aria-label="Przeciągnij, żeby zmienić kolejność" {...reorder.handle(index)}>
        ⠿
      </span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Nazwa sekcji, np. Krem" aria-label="Nazwa sekcji" />
      <button type="button" className="icon" onClick={onRemove} aria-label="Usuń sekcję">
        ✕
      </button>
    </div>
  );
}
