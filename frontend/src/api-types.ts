// PLIK WYGENEROWANY - nie zmieniaj ręcznie.
// Źródło: backend/app/schemas.py. Odświeżenie (z folderu backend):
//   python -m app.export_types > ../frontend/src/api-types.ts

export interface AiIngredient {
  // Linijka po polsku do wyświetlenia, np. '200 g mąki pszennej'
  text: string;
  // Nazwa kanoniczna do wyszukiwania: po polsku, małymi literami, mianownik liczby pojedynczej, bez ilości i przymiotników typu 'duży', np. 'mąka pszenna', 'pomidor'
  name: string;
  // Ilość jako liczba w jednostce `unit`, null gdy brak
  amount: number | null;
  // g, kg, ml, l, szt., łyżka, łyżeczka, szczypta, ząbek, opakowanie albo ''
  unit: string;
  // Linijka dokładnie tak, jak w źródle
  original_text: string;
}

export interface AiRecipe {
  title: string;
  // 1-2 zdania o daniu po polsku, albo ''
  description: string;
  // np. '4 porcje', albo ''
  servings: string;
  prep_minutes: number | null;
  cook_minutes: number | null;
  total_minutes: number | null;
  // Kod języka źródła, np. 'pl', 'en'
  original_language: string;
  ingredients: AiIngredient[];
  steps: AiStep[];
  // Numer obrazka ze zdjęciem gotowego dania, albo null
  main_image_index: number | null;
  // 1-4 kategorie, np. ['Danie główne', 'Air fryer']. Wybieraj z listy istniejących kategorii; nową (krótką, z dużej litery) dodaj tylko, gdy żadna nie pasuje
  categories: string[];
  // Szacunkowe kalorie na 1 porcję, null gdy nie da się ocenić
  kcal?: number | null;
  // Szacunkowe białko na 1 porcję w gramach
  protein?: number | null;
  // Szacunkowy tłuszcz na 1 porcję w gramach
  fat?: number | null;
  // Szacunkowe węglowodany na 1 porcję w gramach
  carbs?: number | null;
}

export interface AiStep {
  // Treść kroku po polsku, temperatury w °C
  text: string;
  // Numer obrazka (z listy obrazków) pokazującego ten krok, albo null
  image_index: number | null;
}

export interface AuthStatus {
  authenticated: boolean;
  auth_required: boolean;
  ai_enabled: boolean;
  ai_provider: string | null;
  ai_providers: string[];
  ha_enabled: boolean;
}

export interface AutoCategorizeOut {
  // Ilu przepisom AI przypisało kategorie
  updated: number;
  // Ile przepisów nadal nie ma kategorii
  remaining: number;
}

export interface BackupFile {
  name: string;
  size: number;
  created_at: string;
}

export interface CategoryOut {
  name: string;
  recipe_count: number;
}

export interface ChatIn {
  messages: ChatMessage[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  recipe?: AiRecipe | null;
}

export interface ChatOut {
  text: string;
  recipes: RecipeSummary[];
  new_recipe: AiRecipe | null;
}

export interface ChatSaveIn {
  recipe: AiRecipe;
}

export interface CookLogOut {
  id: number;
  cooked_at: string;
  rating: number | null;
  note: string;
  image_url: string | null;
}

export interface CookMatch {
  recipe: RecipeSummary;
  have: string[];
  missing: string[];
  use_first: string[];
}

export interface CookRequest {
  ingredients: string[];
  max_missing?: number;
}

export interface ImageFromUrl {
  url: string;
}

export interface ImageSearchProgress {
  running: boolean;
  done: number;
  found: number;
  total: number;
  missing: number;
}

export interface ImportJobOut {
  id: number;
  kind: "url" | "image" | "text";
  source: string;
  status: "pending" | "running" | "done" | "failed" | "duplicate";
  error: string;
  recipe_id: number | null;
  recipe_count: number;
  created_at: string;
}

export interface IngredientLineInput {
  // Linijka do wyświetlenia, np. '200 g mąki'
  text: string;
  // Nazwa do wyszukiwania, np. 'mąka pszenna'
  name: string;
  amount?: number | null;
  unit?: string;
  original_text?: string;
}

export interface IngredientLine {
  // Linijka do wyświetlenia, np. '200 g mąki'
  text: string;
  // Nazwa do wyszukiwania, np. 'mąka pszenna'
  name: string;
  amount: number | null;
  unit: string;
  original_text: string;
}

export interface IngredientOut {
  id: number;
  name: string;
  is_staple: boolean;
  recipe_count: number;
}

export interface IngredientUpdate {
  is_staple: boolean;
}

export interface LoginIn {
  password: string;
}

export interface MealPlanIn {
  day: string;
  recipe_id: number;
}

export interface MealPlanOut {
  id: number;
  day: string;
  recipe: RecipeSummary;
}

export interface PantryExpiresIn {
  name: string;
  expires: string | null;
}

export interface PantryIn {
  // Wszystkie produkty, które są teraz w domu
  names: string[];
}

export interface PantryItem {
  name: string;
  expires: string | null;
}

export interface PlanSuggestionDay {
  day: string;
  recipe: RecipeSummary;
  reason: string;
}

export interface PlanSuggestionIn {
  days: string[];
  // Np. 'raz ryba, do 40 minut'
  wishes?: string;
}

export interface PlanSuggestionOut {
  id: number;
  status: "running" | "done" | "failed";
  error: string;
  text: string;
  days: PlanSuggestionDay[];
}

export interface RecipeIn {
  title: string;
  description?: string;
  servings?: string;
  prep_minutes?: number | null;
  cook_minutes?: number | null;
  total_minutes?: number | null;
  source_url?: string;
  notes?: string;
  ingredients?: IngredientLineInput[];
  steps?: StepIn[];
  categories?: string[];
}

export interface RecipeOut {
  id: number;
  title: string;
  image_url: string | null;
  thumb_url: string | null;
  total_minutes: number | null;
  source_type: "url" | "image" | "text" | "manual" | "ai";
  categories: string[];
  favorite: boolean;
  rating: number | null;
  cooked_count: number;
  last_cooked_at: string | null;
  created_at: string;
  description: string;
  servings: string;
  prep_minutes: number | null;
  cook_minutes: number | null;
  source_url: string;
  original_language: string;
  notes: string;
  kcal: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  ingredients: IngredientLine[];
  steps: StepOut[];
  step_images: (string | null)[];
  variant_of: VariantRef | null;
  variant_name: string;
  variants: VariantRef[];
  cook_log: CookLogOut[];
}

// Szybka zmiana pojedynczych pól bez wysyłania całego formularza.
export interface RecipePatch {
  favorite?: boolean | null;
  // 0 = usuń ocenę
  rating?: number | null;
  notes?: string | null;
}

export interface RecipeStats {
  // Wszystkie przepisy
  total: number;
  // Przepisy bez kategorii
  uncategorized: number;
}

export interface RecipeSummary {
  id: number;
  title: string;
  image_url: string | null;
  thumb_url: string | null;
  total_minutes: number | null;
  source_type: "url" | "image" | "text" | "manual" | "ai";
  categories: string[];
  favorite: boolean;
  rating: number | null;
  cooked_count: number;
  last_cooked_at: string | null;
  created_at: string;
}

export interface RestoreResult {
  // Ile przepisów jest w przywróconej kopii
  recipes: number;
}

export interface ShoppingFromPlan {
  start: string;
  end: string;
  skip_staples?: boolean;
}

export interface ShoppingFromRecipe {
  recipe_id: number;
  factor?: number;
  skip_staples?: boolean;
}

export interface ShoppingItemIn {
  text: string;
}

export interface ShoppingItemOut {
  id: number;
  text: string;
  recipes: string;
  checked: boolean;
  aisle: string;
  aisle_order: number;
  in_ha: boolean;
}

export interface ShoppingItemPatch {
  checked?: boolean | null;
  text?: string | null;
}

export interface ShoppingResult {
  added: number;
  skipped: string[];
}

export interface StapleIn {
  name: string;
}

export interface StepIn {
  text: string;
  image?: string | null;
}

export interface StepOut {
  text: string;
  image_url: string | null;
}

export interface SubstituteIn {
  // Linijka składnika, którego brakuje
  ingredient: string;
}

export interface SubstituteOut {
  text: string;
}

export interface TextImportIn {
  // Tekst przepisu
  text: string;
}

export interface UrlImportIn {
  url: string;
  force?: boolean;
}

export interface VariantIn {
  // Np. 'wersja wege', 'na 8 osób'
  wish: string;
}

export interface VariantRef {
  id: number;
  title: string;
  variant_name: string;
}
