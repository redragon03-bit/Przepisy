// Wszystkie zapytania do backendu w jednym miejscu.
// Typy odpowiadają klasom z backend/app/schemas.py - zmieniając jedno, zmień drugie.

export interface IngredientLine {
  text: string;
  name: string;
  amount: number | null;
  unit: string;
  original_text: string;
}

export interface RecipeSummary {
  id: number;
  title: string;
  image_url: string | null;
  total_minutes: number | null;
  source_type: "url" | "image" | "manual";
  categories: string[];
  favorite: boolean;
  rating: number | null;
  created_at: string;
}

export interface Recipe extends RecipeSummary {
  description: string;
  servings: string;
  prep_minutes: number | null;
  cook_minutes: number | null;
  source_url: string;
  original_language: string;
  notes: string;
  cooked_count: number;
  last_cooked_at: string | null;
  ingredients: IngredientLine[];
  steps: { text: string; image_url: string | null }[];
  step_images: (string | null)[];
}

export interface RecipeInput {
  title: string;
  description: string;
  servings: string;
  prep_minutes: number | null;
  cook_minutes: number | null;
  total_minutes: number | null;
  source_url: string;
  notes: string;
  ingredients: IngredientLine[];
  steps: { text: string; image: string | null }[];
  categories: string[];
}

export interface Category {
  name: string;
  recipe_count: number;
}

export interface Ingredient {
  id: number;
  name: string;
  is_staple: boolean;
  recipe_count: number;
}

export interface CookMatch {
  recipe: RecipeSummary;
  have: string[];
  missing: string[];
}

export interface ImportJob {
  id: number;
  kind: "url" | "image";
  source: string;
  status: "pending" | "running" | "done" | "failed" | "duplicate";
  error: string;
  recipe_id: number | null;
  recipe_count: number;
  created_at: string;
}

export interface AuthStatus {
  authenticated: boolean;
  auth_required: boolean;
  ai_enabled: boolean;
  ai_provider: "anthropic" | "gemini" | null;
  ha_enabled: boolean;
}

export interface ShoppingItem {
  id: number;
  text: string;
  recipes: string;
  checked: boolean;
}

export interface PlanEntry {
  id: number;
  day: string; // "2026-10-20"
  recipe: RecipeSummary;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Wywoływane, gdy serwer odpowie 401 (sesja wygasła) - App.tsx pokazuje wtedy logowanie
let onUnauthorized = () => {};
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });
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
  getRecipe: (id: number) => request<Recipe>("GET", `/api/recipes/${id}`),
  createRecipe: (data: RecipeInput) => request<Recipe>("POST", "/api/recipes", data),
  updateRecipe: (id: number, data: RecipeInput) => request<Recipe>("PUT", `/api/recipes/${id}`, data),
  deleteRecipe: (id: number) => request<void>("DELETE", `/api/recipes/${id}`),
  // Ulubione / ocena (0 = usuń) / notatki bez wysyłania całego formularza
  patchRecipe: (id: number, data: { favorite?: boolean; rating?: number; notes?: string }) =>
    request<Recipe>("PATCH", `/api/recipes/${id}`, data),
  markCooked: (id: number) => request<Recipe>("POST", `/api/recipes/${id}/cooked`),
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
  addStaple: (name: string) => request<Ingredient>("POST", "/api/ingredients/staples", { name }),
  whatCanICook: (ingredients: string[], maxMissing: number) =>
    request<CookMatch[]>("POST", "/api/cook", { ingredients, max_missing: maxMissing }),

  listShopping: () => request<ShoppingItem[]>("GET", "/api/shopping"),
  addShoppingItem: (text: string) => request<ShoppingItem>("POST", "/api/shopping", { text }),
  addRecipeToShopping: (recipeId: number, factor = 1) =>
    request<{ added: number }>("POST", "/api/shopping/from-recipe", { recipe_id: recipeId, factor }),
  addPlanToShopping: (start: string, end: string) =>
    request<{ added: number }>("POST", "/api/shopping/from-plan", { start, end }),
  setShoppingChecked: (id: number, checked: boolean) =>
    request<ShoppingItem>("PATCH", `/api/shopping/${id}`, { checked }),
  deleteShoppingItem: (id: number) => request<void>("DELETE", `/api/shopping/${id}`),
  clearShopping: (onlyChecked: boolean) =>
    request<void>("POST", `/api/shopping/clear${query({ only_checked: onlyChecked ? "true" : "false" })}`),
  sendShoppingToHa: () => request<{ added: number }>("POST", "/api/shopping/send-to-ha"),

  listPlan: (start: string, end: string) => request<PlanEntry[]>("GET", `/api/plan${query({ start, end })}`),
  addToPlan: (day: string, recipeId: number) => request<PlanEntry>("POST", "/api/plan", { day, recipe_id: recipeId }),
  removeFromPlan: (id: number) => request<void>("DELETE", `/api/plan/${id}`),

  // force = importuj, nawet jeśli link już jest w bazie
  importUrl: (url: string, force = false) => request<ImportJob>("POST", "/api/imports/url", { url, force }),
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
