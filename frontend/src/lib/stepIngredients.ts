import type { IngredientLine } from "../api";

// Które składniki są użyte w danym kroku - do pokazania pod krokiem w trybie gotowania.
// Szukamy w treści kroku nazwy składnika z polską odmianą: "pomidor" znajdzie "pomidory",
// "masło" znajdzie "maśle", "cukier" znajdzie "cukru". Bez AI, więc działa dla wszystkich przepisów.

export function fold(text: string): string {
  return text.toLowerCase().replace(/ł/g, "l").normalize("NFKD").replace(/\p{M}/gu, "");
}

// Tematy słowa: zwykły (bez końcówki) i bez "ruchomego e" przed ostatnią spółgłoską:
// cukier -> cukr-u, ogórek -> ogórk-a, marchew -> marchw-i, jajek -> jajk-o
function stems(word: string): string[] {
  const result = [word.slice(0, Math.max(3, word.length - 2))];
  const fleeting = word.match(/^(.*[^aeiouy])i?e([^aeiouy])$/);
  if (fleeting && fleeting[1].length >= 2) result.push(fleeting[1] + fleeting[2]);
  return result;
}

function pattern(name: string): RegExp | null {
  const word = fold(name).split(/[^a-z]+/).find((w) => w.length >= 3);
  if (!word) return null;
  const alternatives = stems(word).map((stem) => `${stem}[a-z]{0,${Math.max(2, word.length - stem.length + 2)}}`);
  return new RegExp(`(?<![a-z])(?:${alternatives.join("|")})(?![a-z])`);
}

type Step = string | { text: string; section?: string };

const sectionKey = (section: string | undefined) => fold(section ?? "").trim();

// Numery składników użytych w każdym kroku. Gdy krok jest w sekcji (np. "Ciasto"), a składniki
// mają sekcję o tej samej nazwie - bierzemy tylko je (masło z "Kruszonki" nie trafi do "Ciasta").
export function stepIngredients(ingredients: IngredientLine[], steps: Step[]): number[][] {
  const patterns = ingredients.map((i) => pattern(i.name || i.text));
  return steps.map((step) => {
    const { text, section } = typeof step === "string" ? { text: step, section: "" } : step;
    const own = sectionKey(section);
    const onlyOwn = !!own && ingredients.some((i) => sectionKey(i.section) === own);
    const folded = fold(text);
    return patterns.flatMap((p, index) =>
      p && p.test(folded) && (!onlyOwn || sectionKey(ingredients[index].section) === own) ? [index] : [],
    );
  });
}
