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

// Zdrobnienie albo przymiotnik to inny produkt: "oliwa"/"oliwki", "olej"/"olejek", "cukier"/"cukierki",
// "kasza"/"kaszanka", "pomidor"/"pomidorowy"
const OTHER_PRODUCT = /^(e?k|ank|ecz|ow[aeyo]|owej|owego|owych|sk|ck)/;

// Ten sam wyraz w innej formie ("karkówka"/"karkówki", "czosnek"/"czosnku"), ale nie zdrobnienie
// ani przymiotnik. To samo robi serwer (same_word() w services/matching.py).
function sameForm(a: string, b: string): boolean {
  if (a === b) return true;
  if (!sameWord(a, b)) return false;
  let common = 0;
  while (common < Math.min(a.length, b.length) && a[common] === b[common]) common++;
  const restA = a.slice(common);
  const restB = b.slice(common);
  return !(
    (OTHER_PRODUCT.test(restA) && !restB.includes("k")) ||
    (OTHER_PRODUCT.test(restB) && !restA.includes("k"))
  );
}

// Czy produkt ze spiżarni wystarczy na składnik przepisu. Pierwszy wyraz (sam produkt) ten sam,
// a pozostałe wyrazy z `have` są gdzieś w `needed`: "karkówka" na "karkówki wieprzowej",
// "ser" na "ser żółty". Ale "ser" nie na "serek", "oliwa" nie na "oliwki", "papryka słodka"
// nie na "paprykę". To samo robi serwer (covers() w services/matching.py).
export function covers(have: string, needed: string): boolean {
  const general = productWords(have);
  const specific = productWords(needed);
  if (!general.length || !specific.length || !sameForm(general[0], specific[0])) return false;
  const left = specific.slice(1);
  for (const word of general.slice(1)) {
    const at = left.findIndex((other) => sameForm(word, other));
    if (at < 0) return false;
    left.splice(at, 1);
  }
  return true;
}

// Jeden człon składnika; "masło lub margaryna" - wystarczy jedno
function partInStock(haves: string[], exact: Set<string>, part: string): boolean {
  return part
    .split(/\s+(?:lub|albo)\s+|\s*\/\s*/i)
    .map((option) => option.trim())
    .some((option) => option && (exact.has(fold(option)) || haves.some((have) => covers(have, option))));
}

// Czy w domu jest wszystko na składnik: "sól i pieprz" wymaga obu. `staples` ("Zawsze w domu")
// liczą się tylko dokładnie: "cukier" nie pokrywa "cukru pudru". To samo robi serwer (in_stock()).
export function inStock(haves: string[], needed: string, staples: string[] = []): boolean {
  const exact = new Set(staples.map(fold));
  if (exact.has(fold(needed))) return true;
  const parts = needed
    .replace(/\(.*?\)/g, " ")
    .split(/\s+(?:i|oraz)\s+/i)
    .filter((part) => part.trim());
  if (parts.length > 1) return parts.every((part) => partInStock(haves, exact, part));
  return partInStock(haves, exact, needed);
}
