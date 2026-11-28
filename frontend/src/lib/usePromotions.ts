// Aktualne promocje z gazetek - pobierane raz na kilka minut dla wszystkich ekranów
import { useEffect, useState } from "react";
import { api, Promotion } from "../api";
import { readCached } from "./cachedLoad";

const FRESH_MS = 5 * 60_000;
const STORAGE_KEY = "promotions";
let cache: { at: number; promos: Promise<Promotion[]> } | null = null;

// Ostatnio pobrane promocje zapamiętane w telefonie (ekrany rysują je od razu)
export function storedPromotions(): Promotion[] | null {
  return readCached<Promotion[]>(STORAGE_KEY);
}

export function rememberPromotions(promos: Promotion[]) {
  try {
    localStorage.setItem(`screen-cache:${STORAGE_KEY}`, JSON.stringify(promos));
  } catch {
    // tryb prywatny - bez zapamiętania
  }
}

export function loadPromotions(force = false): Promise<Promotion[]> {
  if (force || !cache || Date.now() - cache.at > FRESH_MS) {
    const entry = {
      at: Date.now(),
      promos: api.listPromotions().then(
        (promos) => {
          rememberPromotions(promos);
          return promos;
        },
        (e) => {
          // Błąd (np. dodatek się aktualizuje) nie zostaje w pamięci na 5 minut - następny ekran spróbuje znowu
          if (cache === entry) cache = null;
          throw e;
        },
      ),
    };
    cache = entry;
  }
  return cache.promos;
}

// Aktualne promocje (zapamiętane albo pusta lista, gdy nie ma albo brak internetu)
export function usePromotions(): Promotion[] {
  const [promos, setPromos] = useState<Promotion[]>(() => storedPromotions() ?? []);
  useEffect(() => {
    let alive = true;
    loadPromotions().then(
      (p) => alive && setPromos(p),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, []);
  return promos;
}
