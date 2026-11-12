import { useState } from "react";
// Ustawienie zapamiętane w telefonie na stałe (np. wybrane sklepy w Promocjach).
// W trybie prywatnym działa tylko do zamknięcia ekranu.
export function useRemembered(key, initial) {
    const [value, setValue] = useState(() => {
        try {
            const saved = localStorage.getItem(key);
            return saved === null ? initial : JSON.parse(saved);
        }
        catch {
            return initial;
        }
    });
    const set = (next) => {
        setValue(next);
        try {
            localStorage.setItem(key, JSON.stringify(next));
        }
        catch {
            // tryb prywatny - bez zapamiętania
        }
    };
    return [value, set];
}
