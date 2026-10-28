import type { IngredientLine } from "../api";

// Które składniki są użyte w danym kroku - do pokazania pod krokiem w trybie gotowania.
// Szukamy w treści kroku nazwy składnika z polską odmianą: "pomidor" znajdzie "pomidory",
// "masło" znajdzie "maśle". Bez AI, więc działa dla wszystkich przepisów.

export function fold(text: string): string {
  return text.toLowerCase().replace(/ł/g, "l").normalize("NFKD").replace(/\p{M}/gu, "");
}

function pattern(name: string): RegExp | null {
  const word = fold(name).split(/[^a-z]+/).find((w) => w.length >= 3);
  if (!word) return null;
  const stem = word.slice(0, Math.max(3, word.length - 2));
  const ending = word.length - stem.length + 2;
  return new RegExp(`(?<![a-z])${stem}[a-z]{0,${ending}}(?![a-z])`);
}

// Numery składników użytych w każdym kroku
export function stepIngredients(ingredients: IngredientLine[], steps: string[]): number[][] {
  const patterns = ingredients.map((i) => pattern(i.name || i.text));
  return steps.map((step) => {
    const text = fold(step);
    return patterns.flatMap((p, index) => (p && p.test(text) ? [index] : []));
  });
}
