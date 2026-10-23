import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, Category, ImageSearchProgress, RecipeSummary } from "../api";
import IngredientPicker from "../components/IngredientPicker";
import RecipeCard from "../components/RecipeCard";

// Filtry i miejsce przewinięcia trzymamy w pamięci karty przeglądarki, żeby po wejściu
// w przepis i cofnięciu lista wyglądała tak samo jak przed chwilą.
const STORAGE_KEY = "recipes-list";

type SavedList = {
  q: string;
  ingredients: string[];
  category: string;
  favorites: boolean;
  showFilters: boolean;
  scrollY: number;
};

function loadSaved(): SavedList {
  const empty = { q: "", ingredients: [], category: "", favorites: false, showFilters: false, scrollY: 0 };
  try {
    return { ...empty, ...JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}") };
  } catch {
    return empty;
  }
}

function save(list: SavedList) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // brak miejsca albo tryb prywatny - trudno, po prostu nie zapamiętamy
  }
}

// Ostatnio pokazana lista, żeby po powrocie od razu ją narysować (bez "Ładowanie…")
// i móc przewinąć w to samo miejsce, zanim przyjdą świeże dane.
let cache: { recipes: RecipeSummary[]; categories: Category[]; uncategorized: number; total: number } | null = null;

// Strona główna: lista przepisów z wyszukiwaniem po nazwie, kategorii i składnikach.
export default function RecipesPage({ aiEnabled }: { aiEnabled: boolean }) {
  const [saved] = useState(loadSaved);
  const [q, setQ] = useState(saved.q);
  const [ingredients, setIngredients] = useState<string[]>(saved.ingredients);
  const [category, setCategory] = useState(saved.category);
  const [favorites, setFavorites] = useState(saved.favorites);
  const [categories, setCategories] = useState<Category[]>(cache?.categories ?? []);
  const [uncategorized, setUncategorized] = useState(cache?.uncategorized ?? 0);
  const [total, setTotal] = useState(cache?.total ?? 0);
  const [showFilters, setShowFilters] = useState(saved.showFilters);
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(cache?.recipes ?? null);
  const [sorting, setSorting] = useState(false);
  const [message, setMessage] = useState("");
  const [images, setImages] = useState<ImageSearchProgress | null>(null);

  useEffect(() => {
    api.imageSearchStatus().then(setImages);
  }, []);

  useEffect(() => {
    save({ ...loadSaved(), q, ingredients, category, favorites, showFilters });
  }, [q, ingredients, category, favorites, showFilters]);

  useEffect(() => {
    if (recipes) cache = { recipes, categories, uncategorized, total };
  }, [recipes, categories, uncategorized, total]);

  // Po powrocie przewijamy tam, gdzie użytkownik był. Pozycję zapisujemy na bieżąco;
  // nasłuch zdejmujemy w useLayoutEffect, zanim krótsza strona przepisu "zjedzie" w górę.
  // Gdy listy nie ma jeszcze w pamięci (np. iPhone zamknął apkę w tle), przewijamy po pierwszym wczytaniu.
  const restored = useRef(false);
  useLayoutEffect(() => {
    if (restored.current || !recipes) return;
    restored.current = true;
    window.scrollTo(0, saved.scrollY);
  }, [recipes]);

  useLayoutEffect(() => {
    const onScroll = () => save({ ...loadSaved(), scrollY: window.scrollY });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // W trakcie szukania zdjęć co 3 sekundy odświeżamy postęp i listę (nowe zdjęcia)
  useEffect(() => {
    if (!images?.running) return;
    const timer = setInterval(async () => {
      const status = await api.imageSearchStatus();
      setImages(status);
      api.listRecipes(q, ingredients, category, favorites).then(setRecipes);
    }, 3000);
    return () => clearInterval(timer);
  }, [images?.running, q, ingredients, category, favorites]);

  const loadCategories = () => {
    api.listCategories().then(setCategories);
    api.listRecipes("", [], "-").then((r) => setUncategorized(r.length));
    api.listRecipes("", []).then((r) => setTotal(r.length));
  };
  useEffect(loadCategories, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      api.listRecipes(q, ingredients, category, favorites).then(setRecipes);
    }, 250);
    return () => clearTimeout(timer);
  }, [q, ingredients, category, favorites, sorting]);

  const autoCategorize = async () => {
    setSorting(true);
    setMessage("");
    try {
      const result = await api.autoCategorize();
      setMessage(result.remaining ? `Przypisano ${result.updated}, zostało ${result.remaining} - kliknij jeszcze raz.` : "Gotowe!");
      loadCategories();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setSorting(false);
    }
  };

  // Pokazujemy tylko kategorie, które mają przepisy (plus aktualnie wybraną)
  const visible = categories.filter((c) => c.recipe_count > 0 || c.name === category);

  return (
    <>
      <header className="topbar">
        <Link to="/ustawienia" className="link settings-link" aria-label="Ustawienia">
          ⚙️
        </Link>
        <h1>Przepisy</h1>
        <Link to="/nowy" className="button small">
          + Ręcznie
        </Link>
      </header>
      <div className="search">
        <input
          type="search"
          enterKeyHint="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          placeholder="Szukaj po nazwie…"
        />
        <button type="button" className={showFilters || ingredients.length ? "active" : ""} onClick={() => setShowFilters(!showFilters)}>
          🥕{ingredients.length ? ` ${ingredients.length}` : ""}
        </button>
      </div>
      {recipes !== null && (recipes.length > 0 || category || favorites) && (
        <div className="category-bar">
          <button type="button" className={`chip ${category === "" && !favorites ? "selected" : ""}`} onClick={() => { setCategory(""); setFavorites(false); }}>
            Wszystkie <span className="muted">{total}</span>
          </button>
          <button type="button" className={`chip ${favorites ? "selected" : ""}`} onClick={() => setFavorites(!favorites)}>
            ❤️ Ulubione
          </button>
          {visible.map((c) => (
            <button key={c.name} type="button" className={`chip ${category === c.name ? "selected" : ""}`} onClick={() => setCategory(category === c.name ? "" : c.name)}>
              {c.name} <span className="muted">{c.recipe_count}</span>
            </button>
          ))}
          {uncategorized > 0 && (
            <button type="button" className={`chip ${category === "-" ? "selected" : ""}`} onClick={() => setCategory(category === "-" ? "" : "-")}>
              Bez kategorii <span className="muted">{uncategorized}</span>
            </button>
          )}
        </div>
      )}
      {uncategorized > 0 && aiEnabled && (
        <p className="small">
          <button type="button" className="link" disabled={sorting} onClick={autoCategorize}>
            {sorting ? "AI przypisuje kategorie…" : `✨ Przypisz kategorie automatycznie (${uncategorized} bez kategorii)`}
          </button>
        </p>
      )}
      {aiEnabled && images && (images.running || images.missing > 0) && (
        <p className="small">
          {images.running ? (
            <span className="muted">
              🔍 Szukam zdjęć… {images.done}/{images.total} (znalezione: {images.found})
            </span>
          ) : (
            <button type="button" className="link" onClick={async () => setImages(await api.startImageSearch())}>
              🔍 Znajdź zdjęcia w internecie ({images.missing} bez zdjęcia)
            </button>
          )}
        </p>
      )}
      {message && <p className="muted small">{message}</p>}
      {(showFilters || ingredients.length > 0) && (
        <section className="box">
          <p className="muted small">Przepisy, które mają wszystkie te składniki:</p>
          <IngredientPicker value={ingredients} onChange={setIngredients} />
        </section>
      )}
      {recipes === null ? (
        <p className="muted center">Ładowanie…</p>
      ) : recipes.length === 0 ? (
        <p className="muted center">
          {q || ingredients.length || category || favorites ? "Nic nie znaleziono." : "Nie masz jeszcze przepisów. Dodaj pierwszy w zakładce „Dodaj”."}
        </p>
      ) : (
        <div className="grid">
          {recipes.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      )}
    </>
  );
}
