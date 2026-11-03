// Plakietki "🏷️ Lidl 2,49 zł" przy składnikach przepisu. Nazwy dopasowujemy tak samo jak serwer
// (services/promotions.py: matches): "ser żółty" pasuje do "ser", "mąka" do "mąka pszenna".
// Bez importów z aplikacji - testy (npm test) uruchamiają ten plik bezpośrednio w Node.
export function promoMatches(promo, needed) {
    if (!promo || !needed)
        return false;
    return promo === needed || needed.startsWith(`${promo} `) || promo.startsWith(`${needed} `);
}
// Promocja na składnik (najpierw dokładnie ta sama nazwa), np. "Lidl 2,49 zł"; "" = brak
export function promoLabel(name, promos) {
    const hits = promos.filter((p) => promoMatches(p.ingredient, name));
    const best = hits.find((p) => p.ingredient === name) ?? hits[0];
    return best ? `${best.store} ${best.price}`.trim() : "";
}
// "do 7.11", "od 9.11 do 14.11" - kiedy obowiązuje promocja
export function validLabel(from, to, today = new Date()) {
    const short = (iso) => {
        const [, m, d] = iso.split("-");
        return `${Number(d)}.${m}`;
    };
    const pad = (n) => String(n).padStart(2, "0");
    const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    if (from && from > todayIso)
        return to ? `od ${short(from)} do ${short(to)}` : `od ${short(from)}`;
    return to ? `do ${short(to)}` : "";
}
