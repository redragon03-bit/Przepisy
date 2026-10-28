// Wszystkie zapytania do backendu w jednym miejscu.
// Typy danych są generowane z backend/app/schemas.py do pliku api-types.ts
// (python -m app.export_types) - tutaj nadajemy im krótsze nazwy używane w aplikacji.
import type * as Api from "./api-types";

export type IngredientLine = Api.IngredientLine;
export type RecipeSummary = Api.RecipeSummary;
export type Recipe = Api.RecipeOut;
// Formularz przepisu ma zawsze wszystkie pola (serwer pozwala niektóre pominąć)
export type RecipeInput = Required<Api.RecipeIn>;
export type Category = Api.CategoryOut;
export type Ingredient = Api.IngredientOut;
export type CookMatch = Api.CookMatch;
export type ImportJob = Api.ImportJobOut;
export type AuthStatus = Api.AuthStatus;
export type ImageSearchProgress = Api.ImageSearchProgress;
export type ShoppingItem = Api.ShoppingItemOut;
export type PlanEntry = Api.MealPlanOut;
export type AiRecipe = Api.AiRecipe;
export type ChatReply = Api.ChatOut;
export type ShoppingResult = Api.ShoppingResult;
export type BackupFile = Api.BackupFile;
export type RecipeStats = Api.RecipeStats;
export type CookLogEntry = Api.CookLogOut;
export type PantryItem = Api.PantryItem;
export type PlanSuggestion = Api.PlanSuggestionOut;
export type DuplicateGroup = Api.DuplicateGroup;

export interface ChatMessage extends Api.ChatMessage {
  // Tylko w odpowiedziach asystenta, na ekranie: polecane przepisy z bazy (serwerowi ich nie odsyłamy)
  recipes?: RecipeSummary[];
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Ostatni stan logowania - żeby aplikacja otworzyła się bez internetu (np. lista zakupów w sklepie)
const AUTH_KEY = "auth-status";

export function saveAuth(status: AuthStatus) {
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify(status));
  } catch {
    // tryb prywatny - bez internetu aplikacja się wtedy nie otworzy, trudno
  }
}

export function savedAuth(): AuthStatus | null {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) ?? "null");
  } catch {
    return null;
  }
}

// Wywoływane, gdy serwer odpowie 401 (sesja wygasła) - App.tsx pokazuje wtedy logowanie
let onUnauthorized = () => {};
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const isForm = body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body && !isForm ? { "Content-Type": "application/json" } : undefined,
      body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (e) {
    // Przerwanie przez nas (AbortController) przekazujemy dalej bez zmian
    if (signal?.aborted) throw e;
    // Safari pisze wtedy "Load failed", Chrome "Failed to fetch" - pokazujemy coś zrozumiałego
    throw new ApiError(0, "Brak połączenia z serwerem - spróbuj jeszcze raz.");
  }
  if (response.status === 401 && path !== "/api/auth/login") onUnauthorized();
  if (!response.ok) {
    let message = `Błąd ${response.status}`;
    try {
      const data = await response.json();
      if (typeof data.detail === "string") message = data.detail;
    } catch {
      // odpowiedź bez JSON - zostaje ogólny komunikat
    }
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

function query(params: Record<string, string | string[]>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const v of Array.isArray(value) ? value : [value]) if (v) search.append(key, v);
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const api = {
  authStatus: () => request<AuthStatus>("GET", "/api/auth/status"),
  login: (password: string) => request<void>("POST", "/api/auth/login", { password }),
  logout: () => request<void>("POST", "/api/auth/logout"),

  // category: nazwa kategorii, "-" = przepisy bez kategorii, "" = wszystkie
  listRecipes: (q: string, ingredients: string[], category = "", favorite = false) =>
    request<RecipeSummary[]>("GET", `/api/recipes${query({ q, ingredients, category, favorite: favorite ? "true" : "" })}`),
  recipeStats: () => request<RecipeStats>("GET", "/api/recipes/stats"),
  getRecipe: (id: number) => request<Recipe>("GET", `/api/recipes/${id}`),
  createRecipe: (data: RecipeInput) => request<Recipe>("POST", "/api/recipes", data),
  updateRecipe: (id: number, data: RecipeInput) => request<Recipe>("PUT", `/api/recipes/${id}`, data),
  deleteRecipe: (id: number) => request<void>("DELETE", `/api/recipes/${id}`),
  // Ulubione / ocena (0 = usuń) / notatki bez wysyłania całego formularza
  patchRecipe: (id: number, data: { favorite?: boolean; rating?: number; notes?: string }) =>
    request<Recipe>("PATCH", `/api/recipes/${id}`, data),
  imageCandidates: (id: number) => request<string[]>("GET", `/api/recipes/${id}/image-candidates`),
  setImageFromUrl: (id: number, url: string) => request<Recipe>("POST", `/api/recipes/${id}/image-from-url`, { url }),
  imageSearchStatus: () => request<ImageSearchProgress>("GET", "/api/recipes/image-search"),
  startImageSearch: () => request<ImageSearchProgress>("POST", "/api/recipes/image-search"),
  calculateNutrition: (id: number) => request<Recipe>("POST", `/api/recipes/${id}/nutrition`),
  // Wpis w dzienniku gotowania; ocena, notatka i zdjęcie są opcjonalne
  markCooked: (id: number, entry: { rating?: number | null; note?: string; photo?: File | null } = {}) => {
    const form = new FormData();
    if (entry.rating) form.append("rating", String(entry.rating));
    if (entry.note) form.append("note", entry.note);
    if (entry.photo) form.append("photo", entry.photo);
    return request<Recipe>("POST", `/api/recipes/${id}/cooked`, form);
  },
  deleteCooked: (id: number, entryId: number) => request<Recipe>("DELETE", `/api/recipes/${id}/cooked/${entryId}`),
  substitute: (id: number, ingredient: string) =>
    request<{ text: string }>("POST", `/api/recipes/${id}/substitute`, { ingredient }),
  createVariant: (id: number, wish: string) => request<Recipe>("POST", `/api/recipes/${id}/variant`, { wish }),
  uploadRecipeImage: (id: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Recipe>("POST", `/api/recipes/${id}/image`, form);
  },

  listCategories: () => request<Category[]>("GET", "/api/categories"),
  autoCategorize: () => request<{ updated: number; remaining: number }>("POST", "/api/categories/auto"),

  listIngredients: (q = "", staplesOnly = false) =>
    request<Ingredient[]>("GET", `/api/ingredients${query({ q, staples_only: staplesOnly ? "true" : "" })}`),
  setStaple: (id: number, isStaple: boolean) =>
    request<Ingredient>("PATCH", `/api/ingredients/${id}`, { is_staple: isStaple }),
  // Ten sam produkt zapisany na kilka sposobów ("pomidor", "pomidory") i ich łączenie
  findDuplicateIngredients: () => request<DuplicateGroup[]>("GET", "/api/ingredients/duplicates"),
  mergeIngredients: (keep: string, others: string[]) => request<void>("POST", "/api/ingredients/merge", { keep, others }),
  addStaple: (name: string) => request<Ingredient>("POST", "/api/ingredients/staples", { name }),
  whatCanICook: (ingredients: string[], maxMissing: number) =>
    request<CookMatch[]>("POST", "/api/cook", { ingredients, max_missing: maxMissing }),

  listShopping: () => request<ShoppingItem[]>("GET", "/api/shopping"),
  addShoppingItem: (text: string) => request<ShoppingItem>("POST", "/api/shopping", { text }),
  addRecipeToShopping: (recipeId: number, factor = 1) =>
    request<ShoppingResult>("POST", "/api/shopping/from-recipe", { recipe_id: recipeId, factor }),
  addPlanToShopping: (start: string, end: string) =>
    request<ShoppingResult>("POST", "/api/shopping/from-plan", { start, end }),
  setShoppingChecked: (id: number, checked: boolean) =>
    request<ShoppingItem>("PATCH", `/api/shopping/${id}`, { checked }),
  deleteShoppingItem: (id: number) => request<void>("DELETE", `/api/shopping/${id}`),
  clearShopping: (onlyChecked: boolean) =>
    request<void>("POST", `/api/shopping/clear${query({ only_checked: onlyChecked ? "true" : "false" })}`),
  sendShoppingToHa: () => request<ShoppingResult>("POST", "/api/shopping/send-to-ha"),
  // Zmiany z listy w Home Assistant (odhaczenia, nowe pozycje) + cała lista
  syncShopping: () => request<ShoppingItem[]>("POST", "/api/shopping/sync"),

  getPantry: () => request<string[]>("GET", "/api/pantry"),
  setPantry: (names: string[]) => request<string[]>("PUT", "/api/pantry", { names }),
  pantryItems: () => request<PantryItem[]>("GET", "/api/pantry/items"),
  // null = bez terminu
  setPantryExpires: (name: string, expires: string | null) =>
    request<PantryItem[]>("PUT", "/api/pantry/expires", { name, expires }),

  // Backend nie pamięta rozmowy - wysyłamy całą historię (bez list polecanych przepisów)
  chat: (messages: ChatMessage[], signal?: AbortSignal) =>
    request<ChatReply>(
      "POST",
      "/api/chat",
      { messages: messages.map(({ role, text, recipe }) => ({ role, text, recipe: recipe ?? null })) },
      signal,
    ),
  saveChatRecipe: (recipe: AiRecipe) => request<Recipe>("POST", "/api/chat/save", { recipe }),

  listBackups: () => request<BackupFile[]>("GET", "/api/backups"),
  restoreBackup: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ recipes: number }>("POST", "/api/backup/restore", form);
  },

  listPlan: (start: string, end: string) => request<PlanEntry[]>("GET", `/api/plan${query({ start, end })}`),
  addToPlan: (day: string, recipeId: number) => request<PlanEntry>("POST", "/api/plan", { day, recipe_id: recipeId }),
  // Na ile porcji gotujemy - przelicza ilości na liście zakupów
  setPlanServings: (id: number, servings: number) => request<PlanEntry>("PATCH", `/api/plan/${id}`, { servings }),
  removeFromPlan: (id: number) => request<void>("DELETE", `/api/plan/${id}`),
  // Plan od AI układa się w tle - wynik odbieramy przez getPlanSuggestion
  suggestPlan: (days: string[], wishes: string) => request<PlanSuggestion>("POST", "/api/plan/suggest", { days, wishes }),
  getPlanSuggestion: (id: number) => request<PlanSuggestion>("GET", `/api/plan/suggest/${id}`),

  // Powiadomienie z Home Assistant o końcu minutnika (gdy ustawiono ha_notify)
  startTimer: (id: number, label: string, seconds: number) => request<void>("POST", "/api/timers", { id, label, seconds }),
  cancelTimer: (id: number) => request<void>("DELETE", `/api/timers/${id}`),

  // force = importuj, nawet jeśli link już jest w bazie
  importUrl: (url: string, force = false) => request<ImportJob>("POST", "/api/imports/url", { url, force }),
  importText: (text: string) => request<ImportJob>("POST", "/api/imports/text", { text }),
  importImages: (files: File[]) => {
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    return request<ImportJob>("POST", "/api/imports/images", form);
  },
  listImports: () => request<ImportJob[]>("GET", "/api/imports"),
  getImport: (id: number) => request<ImportJob>("GET", `/api/imports/${id}`),
  retryImport: (id: number) => request<ImportJob>("POST", `/api/imports/${id}/retry`),
};

export function formatMinutes(minutes: number | null): string {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}

// Data w formacie "2026-10-20" w strefie czasowej telefonu (nie UTC)
export function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
