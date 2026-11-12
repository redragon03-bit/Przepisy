// Aktualne promocje z gazetek - pobierane raz na kilka minut dla wszystkich ekranów
import { useEffect, useState } from "react";
import { api } from "../api";
const FRESH_MS = 5 * 60_000;
let cache = null;
function loadPromotions() {
    if (!cache || Date.now() - cache.at > FRESH_MS) {
        cache = { at: Date.now(), promos: api.listPromotions().catch(() => []) };
    }
    return cache.promos;
}
// Aktualne promocje (pusta lista, gdy nie ma albo brak internetu)
export function usePromotions() {
    const [promos, setPromos] = useState([]);
    useEffect(() => {
        let alive = true;
        loadPromotions().then((p) => alive && setPromos(p));
        return () => {
            alive = false;
        };
    }, []);
    return promos;
}
