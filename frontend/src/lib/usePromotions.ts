// Aktualne promocje z gazetek - pobierane raz na kilka minut dla wszystkich ekranów
import { useEffect, useState } from "react";
import { api, Promotion } from "../api";

const FRESH_MS = 5 * 60_000;
let cache: { at: number; promos: Promise<Promotion[]> } | null = null;

function loadPromotions(): Promise<Promotion[]> {
  if (!cache || Date.now() - cache.at > FRESH_MS) {
    cache = { at: Date.now(), promos: api.listPromotions().catch(() => []) };
  }
  return cache.promos;
}

// Aktualne promocje (pusta lista, gdy nie ma albo brak internetu)
export function usePromotions(): Promotion[] {
  const [promos, setPromos] = useState<Promotion[]>([]);
  useEffect(() => {
    let alive = true;
    loadPromotions().then((p) => alive && setPromos(p));
    return () => {
      alive = false;
    };
  }, []);
  return promos;
}

