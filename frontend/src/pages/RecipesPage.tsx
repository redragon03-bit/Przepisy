import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, Category, ImageSearchProgress, RecipeSummary } from "../api";
import IngredientPicker from "../components/IngredientPicker";
import RecipeCard from "../components/RecipeCard";
import { isHidden } from "../lib/hidden";
import { currentRandom, pickRandom } from "../lib/random";
import { recentRecipeIds } from "../lib/recent";
import { listRecipes } from "../lib/recipeCache";
import { usePullToRefresh } from "../lib/usePullToRefresh";

// Filtry i miejsce przewinięcia trzymamy w pamięci karty przeglądarki, żeby po wejściu
// w przepis i cofnięciu lista wyglądała tak samo jak przed chwilą.
const STORAGE_KEY = "recipes-list";

type Sort = "new" | "rating" | "time" | "az";

const SORTS: { value: Sort; label: string }[] = [
  { value: "new", label: "Najnowsze" },
  { value: "rating", label: "Ocena" },
  { value: "time", label: "Czas" },
  { value: "az", label: "A–Z" },
];

// Serwer zwraca od najnowszych, resztę sortujemy na telefonie
function sorted(recipes: RecipeSummary[], sort: Sort) {
  const list = [...recipes];
  if (sort === "rating") list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  if (sort === "time") list.sort((a, b) => (a.total_minutes ?? Infinity) - (b.total_minutes ?? Infinity));
  if (sort === "az") list.sort((a, b) => a.title.localeCompare(b.title, "pl"));
  return list;
}

type SavedList = {
  q: string;
  ingredients: string[];
  category: string;
  favorites: boolean;
  showFilters: boolean;
  sort: Sort;
  scrollY: number;
};

function loadSaved(): SavedList {
  const empty = { q: "", ingredients: [], category: "", favorites: false, showFilters: false, sort: "new" as Sort, scrollY: 0 };
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

const MONTH_MS = 30 * 24 * 3600 * 1000;

// Ulubione albo wysoko ocenione przepisy, których nie gotowano od ponad miesiąca (najdawniej pierwsze)
function longNotCooked(recipes: RecipeSummary[]): RecipeSummary[] {
  const now = Date.now();
  const cookedAt = (r: RecipeSummary) => (r.last_cooked_at ? new Date(r.last_cooked_at).getTime() : 0);
  return recipes
    .filter((r) => (r.favorite || (r.rating ?? 0) >= 4) && now - cookedAt(r) > MONTH_MS)
    .sort((a, b) => cookedAt(a) - cookedAt(b))
    .slice(0, 10);
}

// Jeden rząd miniaturek przewijany w bok
function RecipeStrip({ title, recipes }: { title: string; recipes: RecipeSummary[] }) {
  if (!recipes.length) return null;
  return (
    <>
      <p className="muted small recent-title">{title}</p>
      <div className="recent">
        {recipes.map((r) => (
          <Link key={r.id} to={`/przepis/${r.id}`} className="recent-item">
            {r.thumb_url ? <img src={r.thumb_url} alt="" loading="lazy" /> : <div className="card-placeholder">🍽️</div>}
            <span>{r.title}</span>
          </Link>
        ))}
      </div>
    </>
  );
}

// Ostatnio pokazana lista, żeby po powrocie od razu ją narysować (bez "Ładowanie…")
// i móc przewinąć w to samo miejsce, zanim przyjdą świeże dane.
let cache: { recipes: RecipeSummary[]; categories: Category[]; uncategorized: number; total: number } | null = null;

// Strona główna: lista przepisów z wyszukiwaniem (nazwa, składniki, opis, kroki, notatki), kategorią i składnikami.
export default function RecipesPage({ aiEnabled }: { aiEnabled: boolean }) {
  const [saved] = useState(loadSaved);
  const [q, setQ] = useState(saved.q);
  const searchInput = useRef<HTMLInputElement>(null);
  const [ingredients, setIngredients] = useState<string[]>(saved.ingredients);
  const [category, setCategory] = useState(saved.category);
  const [favorites, setFavorites] = useState(saved.favorites);
  const [categories, setCategories] = useState<Category[]>(cache?.categories ?? []);
  const [uncategorized, setUncategorized] = useState(cache?.uncategorized ?? 0);
  const [total, setTotal] = useState(cache?.total ?? 0);
  const [showFilters, setShowFilters] = useState(saved.showFilters);
  const [sort, setSort] = useState<Sort>(saved.sort);
  const navigate = useNavigate();
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(cache?.recipes ?? null);
  const [images, setImages] = useState<ImageSearchProgress | null>(null);

  useEffect(() => {
    api.imageSearchStatus().then(setImages);
  }, []);

  useEffect(() => {
    save({ ...loadSaved(), q, ingredients, category, favorites, showFilters, sort });
  }, [q, ingredients, category, favorites, showFilters, sort]);

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

  // W trakcie szukania zdjęć co 3 sekundy sprawdzamy postęp; listę pobieramy od nowa
  // tylko wtedy, gdy przybyło zdjęć (a nie za każdym razem)
  const found = useRef(images?.found ?? 0);
  useEffect(() => {
    if (!images?.running) return;
    const timer = setInterval(async () => {
      const status = await api.imageSearchStatus().catch(() => null);
      if (!status) return;
      setImages(status);
      if (status.found !== found.current || !status.running) {
        found.current = status.found;
        listRecipes(q, ingredients, category, favorites).then(setRecipes);
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [images?.running, q, ingredients, category, favorites]);

  const loadCategories = () =>
    Promise.all([
      api.listCategories().then(setCategories),
      api.recipeStats().then((stats) => {
        setUncategorized(stats.uncategorized);
        setTotal(stats.total);
      }),
    ]);
  useEffect(() => {
    loadCategories();
  }, []);

  const { pull, refreshing, ready } = usePullToRefresh(() =>
    Promise.all([listRecipes(q, ingredients, category, favorites).then(setRecipes), loadCategories(), api.imageSearchStatus().then(setImages)]),
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      listRecipes(q, ingredients, category, favorites).then(setRecipes);
    }, 250);
    return () => clearTimeout(timer);
  }, [q, ingredients, category, favorites]);

  // Pokazujemy tylko kategorie, które mają przepisy (plus aktualnie wybraną)
  const visible = categories.filter((c) => c.recipe_count > 0 || c.name === category);

  // Przepis usunięty przed chwilą (można go jeszcze przywrócić "Cofnij") nie pojawia się na liście
  const visibleRecipes = recipes && recipes.filter((r) => !isHidden(r.id));
  const shown = visibleRecipes && sorted(visibleRecipes, sort);
  const filtering = Boolean(q || ingredients.length || category || favorites);
  const recent = !filtering && visibleRecipes ? recentRecipeIds().flatMap((id) => visibleRecipes.filter((r) => r.id === id)) : [];
  const forgotten = !filtering && visibleRecipes ? longNotCooked(visibleRecipes) : [];
  const activeFilters = ingredients.length + (sort !== "new" ? 1 : 0);

  const randomRecipe = () => {
    if (!shown?.length) return;
    const random = pickRandom({ pool: shown.map((r) => r.id), seen: [] });
    navigate(`/przepis/${currentRandom(random)}`, { state: { random } });
  };

  return (
    <>
      {(pull > 0 || refreshing) && (
        <div className="pull-indicator" style={{ height: refreshing ? 40 : pull }}>
          {refreshing ? "Odświeżam…" : ready ? "↻ Puść, aby odświeżyć" : "↓"}
        </div>
      )}
      <header className="topbar">
        <h1>Przepisy</h1>
        {shown && shown.length > 1 && (
          <button type="button" className="link random-link" onClick={randomRecipe} aria-label="Losuj przepis">
            🎲
          </button>
        )}
      </header>
      <div className="search sticky">
        <div className="search-field">
          <input
            ref={searchInput}
            type="search"
            enterKeyHint="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            placeholder="Szukaj w przepisach…"
          />
          {q && (
            <button
              type="button"
              className="search-clear"
              aria-label="Wyczyść wyszukiwanie"
              // Bez tego pole straciłoby fokus i klawiatura na iPhonie by się schowała
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setQ("");
                searchInput.current?.focus();
              }}
            >
              ×
            </button>
          )}
        </div>
        <button type="button" className={showFilters || activeFilters ? "active" : ""} onClick={() => setShowFilters(!showFilters)}>
          Filtry{activeFilters ? ` ${activeFilters}` : ""}
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
      {aiEnabled && images?.running && (
        <p className="muted small">
          🔍 Szukam zdjęć… {images.done}/{images.total} (znalezione: {images.found})
        </p>
      )}
      {(showFilters || ingredients.length > 0) && (
        <section className="box">
          {showFilters && (
            <>
              <p className="muted small">Sortuj:</p>
              <div className="chips">
                {SORTS.map((s) => (
                  <button key={s.value} type="button" className={`chip ${sort === s.value ? "selected" : ""}`} onClick={() => setSort(s.value)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="muted small">Przepisy, które mają wszystkie te składniki:</p>
          <IngredientPicker value={ingredients} onChange={setIngredients} />
        </section>
      )}
      <RecipeStrip title="Ostatnio oglądane" recipes={recent} />
      <RecipeStrip title="Dawno nie gotowane" recipes={forgotten} />
      {shown === null ? (
        <p className="muted center">Ładowanie…</p>
      ) : shown.length === 0 ? (
        <p className="muted center">
          {filtering ? "Nic nie znaleziono." : "Nie masz jeszcze przepisów. Dodaj pierwszy w zakładce „Dodaj”."}
        </p>
      ) : (
        <div className="grid">
          {shown.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      )}
    </>
  );
}
