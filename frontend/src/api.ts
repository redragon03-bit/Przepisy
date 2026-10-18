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
  status: "pending" | "running" | "done" | "failed";
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

  listRecipes: (q: string, ingredients: string[]) =>
    request<RecipeSummary[]>("GET", `/api/recipes${query({ q, ingredients })}`),
  getRecipe: (id: number) => request<Recipe>("GET", `/api/recipes/${id}`),
  createRecipe: (data: RecipeInput) => request<Recipe>("POST", "/api/recipes", data),
  updateRecipe: (id: number, data: RecipeInput) => request<Recipe>("PUT", `/api/recipes/${id}`, data),
  deleteRecipe: (id: number) => request<void>("DELETE", `/api/recipes/${id}`),
  uploadRecipeImage: (id: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Recipe>("POST", `/api/recipes/${id}/image`, form);
  },

  listIngredients: (q = "", staplesOnly = false) =>
    request<Ingredient[]>("GET", `/api/ingredients${query({ q, staples_only: staplesOnly ? "true" : "" })}`),
  setStaple: (id: number, isStaple: boolean) =>
    request<Ingredient>("PATCH", `/api/ingredients/${id}`, { is_staple: isStaple }),
  addStaple: (name: string) => request<Ingredient>("POST", "/api/ingredients/staples", { name }),
  whatCanICook: (ingredients: string[], maxMissing: number) =>
    request<CookMatch[]>("POST", "/api/cook", { ingredients, max_missing: maxMissing }),

  importUrl: (url: string) => request<ImportJob>("POST", "/api/imports/url", { url }),
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
