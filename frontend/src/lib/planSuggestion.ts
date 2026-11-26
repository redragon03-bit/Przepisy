import { PlanSuggestion } from "../api";

// Propozycja planu od AI zapamiętana w telefonie: zamknięcie panelu, cofnięcie albo wejście
// w przepis z propozycji nie kasuje jej i nie trzeba generować od nowa. Znika po zapisaniu
// planu, po "Inna propozycja" albo po 12 godzinach.
const KEY = "plan-suggestion";
const MAX_AGE_MS = 12 * 3600 * 1000;

export interface StoredPlanSuggestion {
  suggestion: PlanSuggestion | null;
  chosen: string[];
  wishes: string;
  // Panel był otwarty, gdy wychodziliśmy z Planu (np. do podglądu przepisu) - po powrocie otwieramy go znowu
  open: boolean;
  at: number;
}

export function loadPlanSuggestion(): StoredPlanSuggestion | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null") as StoredPlanSuggestion | null;
    if (!saved || Date.now() - saved.at > MAX_AGE_MS) return null;
    return saved;
  } catch {
    return null;
  }
}

export function savePlanSuggestion(value: Omit<StoredPlanSuggestion, "at">) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...value, at: Date.now() }));
  } catch {
    // tryb prywatny - bez zapamiętania
  }
}

export function setPlanSuggestionOpen(open: boolean) {
  const saved = loadPlanSuggestion();
  if (saved) savePlanSuggestion({ ...saved, open });
}

export function clearPlanSuggestion() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // tryb prywatny
  }
}
