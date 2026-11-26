// Szkic formularza przepisu zapamiętany w telefonie: stuknięcie innej zakładki (albo zamknięcie
// aplikacji przez iPhone'a) nie kasuje tego, co wpisano. Nowy przepis ma jeden szkic,
// edycja - osobny dla każdego przepisu. Szkic znika po zapisaniu albo po "Wyczyść".
const PREFIX = "recipe-draft";

export function draftKey(recipeId: number | null): string {
  return recipeId ? `${PREFIX}-${recipeId}` : PREFIX;
}

export function loadDraft<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
}

export function saveDraft(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // tryb prywatny albo brak miejsca - formularz działa, tylko bez szkicu
  }
}

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // tryb prywatny
  }
}
