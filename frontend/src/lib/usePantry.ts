// Co jest w domu: spiżarnia (Zakupy → W domu) + "zawsze w domu" (sól, olej...).
// Pobierane raz na kilka minut dla wszystkich ekranów, jak promocje.
import { useEffect, useState } from "react";
import { api } from "../api";
import { fold } from "./stepIngredients";

const FRESH_MS = 5 * 60_000;
let cache: { at: number; names: Promise<Pantry> } | null = null;

export interface Pantry {
  // false, gdy spiżarnia jest pusta - wtedy nie oznaczamy niczego jako brakującego
  known: boolean;
  has: (name: string) => boolean;
}

const EMPTY: Pantry = { known: false, has: () => true };

function load(): Promise<Pantry> {
  if (!cache || Date.now() - cache.at > FRESH_MS) {
    const names = Promise.all([api.getPantry(), api.listIngredients("", true)])
      .then(([pantry, staples]) => {
        const all = new Set([...pantry, ...staples.map((s) => s.name)].map(fold));
        return { known: pantry.length > 0, has: (name: string) => !name || all.has(fold(name)) };
      })
      .catch(() => EMPTY);
    cache = { at: Date.now(), names };
  }
  return cache.names;
}

// Po zmianie spiżarni (odhaczenie w zakupach, paragon) - znaczniki "brak" liczymy od nowa
export function forgetPantry() {
  cache = null;
}

export function usePantry(): Pantry {
  const [pantry, setPantry] = useState<Pantry>(EMPTY);
  useEffect(() => {
    let alive = true;
    load().then((p) => alive && setPantry(p));
    return () => {
      alive = false;
    };
  }, []);
  return pantry;
}
