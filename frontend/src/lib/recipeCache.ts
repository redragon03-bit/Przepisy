import { api, isoDay, Recipe, RecipeSummary } from "../api";

// Przepisy zapisane w pamięci telefonu: ekran przepisu pokazuje je od razu (świeże dane
// z serwera podmienia w tle), a bez internetu albo przy wyłączonym serwerze dalej da się
// z nich gotować. Trzymamy ostatnio otwarte i zaplanowane na najbliższy tydzień.
const LIMIT = 60;
const RECIPES_KEY = "offline-recipes";
const LIST_KEY = "offline-recipe-list";

function load<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // tryb prywatny albo brak miejsca - działa, tylko bez pracy offline
  }
}

// Najnowsze na końcu (Map zachowuje kolejność dodania)
const cache = new Map<number, Recipe>(load<Recipe[]>(RECIPES_KEY, []).map((r) => [r.id, r]));
const save = () => store(RECIPES_KEY, [...cache.values()]);

export function cachedRecipe(id: number): Recipe | undefined {
  return cache.get(id);
}

export function cacheRecipe(recipe: Recipe) {
  cache.delete(recipe.id);
  cache.set(recipe.id, recipe);
  while (cache.size > LIMIT) cache.delete(cache.keys().next().value!);
  save();
}

export function forgetRecipe(id: number) {
  cache.delete(id);
  save();
}

// Plan na najbliższe 7 dni pobieramy do pamięci telefonu (w tle, po otwarciu aplikacji)
export async function prefetchPlanned() {
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + 7);
  const entries = await api.listPlan(isoDay(today), isoDay(end));
  for (const id of new Set(entries.map((e) => e.recipe.id))) {
    cacheRecipe(await api.getRecipe(id));
  }
}

// Lista przepisów: bez filtrów zapamiętujemy ją, a bez połączenia pokazujemy zapamiętaną
export async function listRecipes(q: string, ingredients: string[], category: string, favorite: boolean): Promise<RecipeSummary[]> {
  const filtered = Boolean(q || ingredients.length || category || favorite);
  try {
    const list = await api.listRecipes(q, ingredients, category, favorite);
    if (!filtered) store(LIST_KEY, list);
    return list;
  } catch (e) {
    const saved = load<RecipeSummary[] | null>(LIST_KEY, null);
    if (!saved) throw e;
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return saved.filter(
      (r) =>
        words.every((w) => r.title.toLowerCase().includes(w)) &&
        (!category || r.categories.includes(category)) &&
        (!favorite || r.favorite),
    );
  }
}
