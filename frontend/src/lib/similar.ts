// Czy dwie pozycje to ten sam produkt: "Kurczak piersi" i "Pierś z kurczaka", "pomidory" i "2 kg pomidorów".
// Odmiana, szyk wyrazów, ilość i krótkie wyrazy ("z", "do") się nie liczą. To samo robi serwer
// (similar() w services/ingredients.py), żeby spiżarnia i lista zakupów zgadzały się ze sobą.

// Jak fold() w stepIngredients.ts (tu bez importu, żeby test w Node działał bez budowania)
function fold(text: string): string {
  return text.toLowerCase().replace(/ł/g, "l").normalize("NFKD").replace(/\p{M}/gu, "");
}

const FILLER = new Set(["z", "ze", "do", "w", "we", "na", "i", "o", "od", "dla", "bez"]);
const UNITS = new Set(["g", "kg", "dag", "ml", "l", "szt", "sztuk", "sztuki", "sztuka", "op", "opak", "opakowanie", "opakowania", "x"]);

export function productWords(text: string): string[] {
  return fold(text)
    .replace(/\(.*?\)/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !FILLER.has(w) && !UNITS.has(w) && !/^\d/.test(w) && !/^x\d+$/.test(w));
}

// Ten sam wyraz w innej formie: "pomidor" i "pomidory", "piersi" i "pierś"
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  let common = 0;
  while (common < Math.min(a.length, b.length) && a[common] === b[common]) common++;
  return common >= 4 && common >= Math.min(a.length, b.length) - 1 && Math.max(a.length, b.length) - common <= 3;
}

export function sameProduct(a: string, b: string): boolean {
  const wordsA = productWords(a);
  const left = productWords(b);
  if (!wordsA.length || wordsA.length !== left.length) return false;
  for (const word of wordsA) {
    const at = left.findIndex((other) => sameWord(word, other));
    if (at < 0) return false;
    left.splice(at, 1);
  }
  return true;
}

export function findSame<T>(text: string, items: T[], name: (item: T) => string): T | undefined {
  return text.trim() ? items.find((item) => sameProduct(text, name(item))) : undefined;
}
