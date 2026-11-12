// Co jest w domu: spiżarnia (ekran "Co ugotuję?") + "zawsze w domu" (sól, olej...).
// Pobierane raz na kilka minut dla wszystkich ekranów, jak promocje.
import { useEffect, useState } from "react";
import { api } from "../api";
import { fold } from "./stepIngredients";
const FRESH_MS = 5 * 60_000;
let cache = null;
const EMPTY = { known: false, has: () => true };
function load() {
    if (!cache || Date.now() - cache.at > FRESH_MS) {
        const names = Promise.all([api.getPantry(), api.listIngredients("", true)])
            .then(([pantry, staples]) => {
            const all = new Set([...pantry, ...staples.map((s) => s.name)].map(fold));
            return { known: pantry.length > 0, has: (name) => !name || all.has(fold(name)) };
        })
            .catch(() => EMPTY);
        cache = { at: Date.now(), names };
    }
    return cache.names;
}
export function usePantry() {
    const [pantry, setPantry] = useState(EMPTY);
    useEffect(() => {
        let alive = true;
        load().then((p) => alive && setPantry(p));
        return () => {
            alive = false;
        };
    }, []);
    return pantry;
}
