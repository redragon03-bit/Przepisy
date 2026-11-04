import { useState } from "react";

// Ustawienie zapamiętane w telefonie na stałe (np. wybrane sklepy w Promocjach).
// W trybie prywatnym działa tylko do zamknięcia ekranu.
export function useRemembered<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved === null ? initial : (JSON.parse(saved) as T);
    } catch {
      return initial;
    }
  });
  const set = (next: T) => {
    setValue(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // tryb prywatny - bez zapamiętania
    }
  };
  return [value, set];
}
