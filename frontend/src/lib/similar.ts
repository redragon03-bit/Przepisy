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

// Pierwszy wyraz (sam produkt) ten sam, a pozostałe wyrazy `general` są gdzieś w `specific`
function contains(general: string[], specific: string[]): boolean {
  if (!general.length || !specific.length || !sameWord(general[0], specific[0])) return false;
  const left = specific.slice(1);
  for (const word of general.slice(1)) {
    const at = left.findIndex((other) => sameWord(word, other));
    if (at < 0) return false;
    left.splice(at, 1);
  }
  return true;
}

// Czy produkt ze spiżarni wystarczy na składnik przepisu: "karkówka" na "karkówki wieprzowej",
// "ser" na "ser żółty", "ser feta" na "ser". Ale "ser" nie na "serek", a "pomidor" nie na
// "koncentrat pomidorowy". To samo robi serwer (covers() w services/matching.py).
export function covers(have: string, needed: string): boolean {
  const haveWords = productWords(have);
  const neededWords = productWords(needed);
  if (haveWords.join(" ") === neededWords.join(" ")) return haveWords.length > 0;
  return contains(haveWords, neededWords) || contains(neededWords, haveWords);
}

// Czy w domu jest wszystko na składnik. "sól i pieprz" wymaga obu, "masło lub margaryna" - jednego z nich.
export function inStock(haves: string[], needed: string): boolean {
  const all = needed.split(/\s*,\s*|\s+(?:i|oraz)\s+/i).filter((part) => part.trim());
  if (all.length === 0) return false;
  return all.every((part) =>
    part.split(/\s+(?:lub|albo)\s+|\s*\/\s*/i).some((option) => haves.some((have) => covers(have, option))),
  );
}
