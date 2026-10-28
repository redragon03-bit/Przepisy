import { useEffect, useState } from "react";

// Postęp gotowania (krok, odhaczone składniki i kroki) zapisany w pamięci telefonu.
// iPhone potrafi zamknąć aplikację w tle (np. przy odpisywaniu na wiadomość) - po powrocie
// jesteśmy w tym samym miejscu. Po kilku godzinach zapis wygasa: następne gotowanie zaczyna od nowa.
const MAX_AGE_MS = 6 * 3600 * 1000;

function load<T>(key: string, initial: T): T {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null");
    if (saved && Date.now() - saved.at < MAX_AGE_MS) return saved.value;
  } catch {
    // brak zapisu albo tryb prywatny
  }
  return initial;
}

export function useSavedState<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => load(key, initial));
  // Inny przepis (zmiana klucza) - wczytujemy jego zapis
  useEffect(() => setValue(load(key, initial)), [key]);
  const set = (next: T) => {
    setValue(next);
    try {
      localStorage.setItem(key, JSON.stringify({ value: next, at: Date.now() }));
    } catch {
      // tryb prywatny - działa, tylko bez zapamiętania
    }
  };
  return [value, set];
}

// Odhaczanie pozycji listy (numery pozycji), zapamiętane jak wyżej
export function useCheckedSet(key: string): [Set<number>, (index: number) => void] {
  const [list, setList] = useSavedState<number[]>(key, []);
  const checked = new Set(list);
  const toggle = (index: number) => setList(checked.has(index) ? list.filter((i) => i !== index) : [...list, index]);
  return [checked, toggle];
}

// Po "Ugotowane" następne gotowanie zaczyna od początku
export function clearProgress(recipeId: number) {
  for (const key of [`cooking-step-${recipeId}`, `checked-ingredients-${recipeId}`, `checked-steps-${recipeId}`]) {
    try {
      localStorage.removeItem(key);
    } catch {
      // tryb prywatny
    }
  }
}
