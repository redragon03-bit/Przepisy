// Plakietki "🏷️ Lidl 2,49 zł" przy składnikach przepisu. Nazwy dopasowujemy tak samo jak serwer
// (services/promotions.py: matches): "ser żółty" pasuje do "ser", "mąka" do "mąka pszenna".
// Bez importów z aplikacji - testy (npm test) uruchamiają ten plik bezpośrednio w Node.

type PromoLike = { store: string; ingredient: string; price: string; name?: string };

export function promoMatches(promo: string, needed: string): boolean {
  if (!promo || !needed) return false;
  return promo === needed || needed.startsWith(`${promo} `) || promo.startsWith(`${needed} `);
}

// Początek słowa do porównań: "sól" -> "só", "jajko" -> "jaj"
const stem = (w: string) => (w.length >= 4 ? w.slice(0, 3) : w.slice(0, 2));

// Czy nazwa z gazetki naprawdę mówi o tym składniku. AI czasem przypisuje produktowi zły składnik
// (np. "Schab bez kości" jako "sól"), więc początek któregoś słowa ("sól" -> "só", "jajko" -> "jaj")
// musi się pojawić w nazwie produktu. Tak samo na serwerze (services/promotions.py: name_fits).
export function nameFits(product: string | undefined, ingredient: string): boolean {
  const stems = ingredient
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3)
    .map(stem);
  if (!product || !stems.length) return true;
  const name = product.toLowerCase();
  return stems.some((stem) => name.includes(stem));
}

// Gdy potrzebny składnik jest dokładniejszy niż ten z promocji ("sok z cytryny" a promocja na "sok"),
// każde dodatkowe słowo musi być w nazwie produktu: "Sok pomarańczowy" nie jest sokiem z cytryny.
// Tak samo na serwerze (services/promotions.py: details_fit).
export function detailsFit(product: string | undefined, promo: string, needed: string): boolean {
  if (!product || !needed.startsWith(`${promo} `)) return true;
  const name = product.toLowerCase();
  return needed
    .slice(promo.length)
    .split(/\s+/)
    .filter((w) => w.length >= 3)
    .every((w) => name.includes(stem(w)));
}

function fits(p: PromoLike, name: string): boolean {
  return promoMatches(p.ingredient, name) && nameFits(p.name, p.ingredient) && detailsFit(p.name, p.ingredient, name);
}

// Promocje na składnik - najlepsza z każdego sklepu (najpierw dokładnie ta sama nazwa), np. ["Lidl 2,49 zł"].
// `hidden` - sklepy odznaczone w Promocjach.
export function promoLabels(name: string, promos: PromoLike[], hidden: ReadonlySet<string> = new Set()): string[] {
  const best = new Map<string, PromoLike>();
  for (const p of promos) {
    if (hidden.has(p.store) || !fits(p, name)) continue;
    const prev = best.get(p.store);
    if (!prev || (prev.ingredient !== name && p.ingredient === name)) best.set(p.store, p);
  }
  return [...best.values()]
    .sort((a, b) => Number(b.ingredient === name) - Number(a.ingredient === name))
    .map((p) => `${p.store} ${p.price}`.trim());
}

// Jedna plakietka na składnik, np. "Lidl 2,49 zł"; "" = brak
export function promoLabel(name: string, promos: PromoLike[], hidden: ReadonlySet<string> = new Set()): string {
  return promoLabels(name, promos, hidden)[0] ?? "";
}

// "do 7.11", "od 9.11 do 14.11" - kiedy obowiązuje promocja
export function validLabel(from: string | null, to: string | null, today = new Date()): string {
  const short = (iso: string) => {
    const [, m, d] = iso.split("-");
    return `${Number(d)}.${m}`;
  };
  const pad = (n: number) => String(n).padStart(2, "0");
  const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  if (from && from > todayIso) return to ? `od ${short(from)} do ${short(to)}` : `od ${short(from)}`;
  return to ? `do ${short(to)}` : "";
}
