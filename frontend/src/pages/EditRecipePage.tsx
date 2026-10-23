import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, Category, IngredientLine, RecipeInput } from "../api";
import AutoTextarea from "../components/AutoTextarea";

const EMPTY: RecipeInput = {
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

const emptyIngredient = (): IngredientLine => ({ text: "", name: "", amount: null, unit: "", original_text: "" });

// Formularz dodawania (adres /nowy) i edycji (/przepis/:id/edytuj) przepisu.
export default function EditRecipePage() {
  const params = useParams();
  const id = params.id ? Number(params.id) : null;
  const navigate = useNavigate();
  const [form, setForm] = useState<RecipeInput | null>(id ? null : { ...EMPTY, ingredients: [emptyIngredient()], steps: [{ text: "", image: null }] });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [newCategory, setNewCategory] = useState("");

  useEffect(() => {
    api.listCategories().then(setAllCategories);
  }, []);

  useEffect(() => {
    if (!id) return;
    api.getRecipe(id).then((r) =>
      setForm({
        title: r.title,
        description: r.description,
        servings: r.servings,
        prep_minutes: r.prep_minutes,
        cook_minutes: r.cook_minutes,
        total_minutes: r.total_minutes,
        source_url: r.source_url,
        notes: r.notes,
        ingredients: r.ingredients,
        steps: r.steps.map((s, i) => ({ text: s.text, image: r.step_images[i] })),
        categories: r.categories,
      }),
    );
  }, [id]);

  if (!form) return <p className="muted center">Ładowanie…</p>;

  const set = <K extends keyof RecipeInput>(key: K, value: RecipeInput[K]) => setForm({ ...form, [key]: value });
  const minutes = (value: string) => (value ? Number(value) : null);

  const setIngredient = (index: number, patch: Partial<IngredientLine>) =>
    set("ingredients", form.ingredients.map((ing, i) => (i === index ? { ...ing, ...patch } : ing)));
  const setStep = (index: number, text: string) =>
    set("steps", form.steps.map((s, i) => (i === index ? { ...s, text } : s)));

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
      const saved = id ? await api.updateRecipe(id, form) : await api.createRecipe(form);
      navigate(`/przepis/${saved.id}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <form className="edit" onSubmit={save}>
      <header className="topbar">
        <button type="button" className="link" onClick={() => navigate(-1)}>
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
      <p className="muted small">Druga kolumna to nazwa do wyszukiwania, np. „mąka pszenna” dla „200 g mąki pszennej”.</p>
      {form.ingredients.map((ing, i) => (
        <div key={i} className="row ingredient-row">
          <AutoTextarea singleLine value={ing.text} onChange={(e) => setIngredient(i, { text: e.target.value.replace(/\n/g, " ") })} placeholder="200 g mąki pszennej" />
          <AutoTextarea singleLine value={ing.name} onChange={(e) => setIngredient(i, { name: e.target.value.replace(/\n/g, " ") })} placeholder="mąka pszenna" autoCapitalize="none" />
          <button type="button" className="icon" onClick={() => set("ingredients", form.ingredients.filter((_, j) => j !== i))} aria-label="Usuń">
            ✕
          </button>
        </div>
      ))}
      <button type="button" onClick={() => set("ingredients", [...form.ingredients, emptyIngredient()])}>
        + Składnik
      </button>

      <h2>Kroki</h2>
      {form.steps.map((step, i) => (
        <div key={i} className="row step-row">
          <span className="step-number">{i + 1}</span>
          <AutoTextarea rows={2} value={step.text} onChange={(e) => setStep(i, e.target.value)} />
          <button type="button" className="icon" onClick={() => set("steps", form.steps.filter((_, j) => j !== i))} aria-label="Usuń">
            ✕
          </button>
        </div>
      ))}
      <button type="button" onClick={() => set("steps", [...form.steps, { text: "", image: null }])}>
        + Krok
      </button>

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
