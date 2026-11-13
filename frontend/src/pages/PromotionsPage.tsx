import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, Promotion, PromoStatus } from "../api";
import Sheet from "../components/Sheet";
import { validLabel } from "../lib/promo";
import { useHiddenPromoStores } from "../lib/promoBadges";
import { useRemembered } from "../lib/remember";
import { fold } from "../lib/stepIngredients";
import { useToast } from "../lib/toast";

// "Promocje": jedzenie, pieluchy i środki czystości w promocji z gazetek, pogrupowane na sklepy.
// Serwer sam co 12 godzin sprawdza nowe gazetki (Lidl ze strony Lidla, reszta z Blixa)
// i AI wybiera z nich produkty; nocą czyta też obrazki stron głównych gazetek (ceny).
// Stuknięcie produktu: dodanie do listy zakupów.
// Przepisy z produktami w promocji są na ekranie "Co ugotuję?".

// Grupy produktów (kategoria z serwera) i ich przyciski nad listą
const CATEGORIES: [string, string][] = [
  ["jedzenie", "🍎 Jedzenie"],
  ["dziecko", "👶 Dziecko"],
  ["czystosc", "🧽 Czystość"],
];

// Ikonka działu, gdy nie ma wycinka produktu z gazetki
const AISLE_ICONS: Record<string, string> = {
  Napoje: "🧃",
  "Przyprawy i sosy": "🧂",
  "Warzywa i owoce": "🍎",
  Pieczywo: "🥖",
  "Nabiał i jajka": "🧀",
  "Mięso i ryby": "🥩",
  Mrożonki: "🧊",
  "Sypkie i makarony": "🍝",
  "Puszki i słoiki": "🥫",
  "Słodycze i bakalie": "🍫",
  Tłuszcze: "🫒",
  "Chemia i dom": "🧽",
  "Dla dziecka": "👶",
};

// Ikonka konkretnej rzeczy, gdy da się ją poznać po nazwie (herbata to nie sok)
const ITEM_ICONS: [RegExp, string][] = [
  [/herbat|kaw[ay]\b|kawa|cappuccino/, "☕"],
  [/wod[ay]\b|woda/, "💧"],
  [/mlek|mleczn/, "🥛"],
  [/jaj/, "🥚"],
  [/ser\b|sery|serek|mozzarell|gouda|edam/, "🧀"],
  [/maslo|masla/, "🧈"],
  [/kurcz|indyk|drob|skrzyd|udk|udo/, "🍗"],
  [/ryb|losos|dorsz|sledz|makrel|tunczyk|krewet/, "🐟"],
  [/kielbas|parow|szynk|boczek|salami/, "🥓"],
  [/chleb|bulk|bagiet|rogal|pieczyw/, "🍞"],
  [/ziemniak/, "🥔"],
  [/pomidor/, "🍅"],
  [/marchew/, "🥕"],
  [/cebul|czosn/, "🧅"],
  [/ogor/, "🥒"],
  [/jablk/, "🍏"],
  [/banan/, "🍌"],
  [/pomarancz|mandaryn/, "🍊"],
  [/cytryn/, "🍋"],
  [/winogron/, "🍇"],
  [/truskaw/, "🍓"],
  [/ananas/, "🍍"],
  [/awokado/, "🥑"],
  [/makaron|spaghetti|penne/, "🍝"],
  [/ryz\b|ryz /, "🍚"],
  [/czekolad|baton|cukierk|praling/, "🍫"],
  [/ciast|ciastk|babk|piernik/, "🍰"],
  [/lody/, "🍦"],
  [/sok/, "🧃"],
  [/pieluch|chusteczk/, "👶"],
];

function itemIcon(p: Promotion): string {
  const text = fold(`${p.name} ${p.ingredient}`);
  return ITEM_ICONS.find(([re]) => re.test(text))?.[1] ?? AISLE_ICONS[p.aisle] ?? "🛒";
}

// Działy w kolejności jak w sklepie; w dziale największe rabaty na górze
function byAisle(items: Promotion[]): [string, Promotion[]][] {
  const sorted = [...items].sort(
    (a, b) => a.aisle_order - b.aisle_order || b.discount - a.discount || a.name.localeCompare(b.name, "pl"),
  );
  const groups: [string, Promotion[]][] = [];
  for (const p of sorted) {
    const last = groups[groups.length - 1];
    if (last && last[0] === p.aisle) last[1].push(p);
    else groups.push([p.aisle, [p]]);
  }
  return groups;
}

function checkedLabel(status: PromoStatus): string {
  if (status.running) return status.progress ? `czytam: ${status.progress}` : "sprawdzam gazetki…";
  if (!status.last_check) return "";
  const at = new Date(status.last_check);
  const time = at.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  const sameDay = at.toDateString() === new Date().toDateString();
  return `sprawdzone ${sameDay ? "dziś" : at.toLocaleDateString("pl-PL", { day: "numeric", month: "numeric" })} ${time}`;
}

export default function PromotionsPage({ aiEnabled }: { aiEnabled: boolean }) {
  const [promos, setPromos] = useState<Promotion[] | null>(null);
  const [status, setStatus] = useState<PromoStatus | null>(null);
  const [q, setQ] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  // Sklepy i grupy ukryte na liście (stuknięcie chowa/pokazuje) - zapamiętane w telefonie.
  // Odznaczone sklepy znikają też z plakietek w Zakupach, przy składnikach i w "Z promocji".
  const [hidden, setHidden] = useHiddenPromoStores();
  const [hiddenCatList, setHiddenCatList] = useRemembered<string[]>("promo-hidden-groups", []);
  // Tylko jeden dział, np. "Mięso i ryby" ("" = wszystkie)
  const [onlyAisle, setOnlyAisle] = useRemembered<string>("promo-aisle", "");
  const hiddenCats = new Set(hiddenCatList);
  const setHiddenCats = (next: Set<string>) => setHiddenCatList([...next]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [chosen, setChosen] = useState<Promotion | null>(null);
  const { toast, run } = useToast();

  const load = () => {
    api.listPromotions().then(setPromos, () => setPromos([]));
    api.promoStatus().then(setStatus, () => {});
    api.promoFavorites().then(setFavorites, () => {});
  };
  useEffect(load, []);

  const toggleFavorite = async (promo: Promotion) => {
    const on = !favorites.includes(promo.key);
    const fresh = await run(() => api.setPromoFavorite(promo.key, on));
    if (!fresh) return;
    setFavorites(fresh);
    toast(on ? `⭐ Ulubione: ${promo.key} (każda marka)` : `Usunięto z ulubionych: ${promo.key}`);
    api.listPromotions().then(setPromos, () => {});
  };

  // Sprawdzanie gazetek trwa w tle (AI czyta nowe gazetki) - co 5 sekund pytamy, czy skończyło
  const running = status?.running ?? false;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(async () => {
      const fresh = await api.promoStatus().catch(() => null);
      if (fresh && !fresh.running) load();
      else if (fresh) setStatus(fresh);
    }, 5000);
    return () => clearInterval(timer);
  }, [running]);

  const refresh = async () => {
    const fresh = await run(() => api.refreshPromotions());
    if (fresh) setStatus(fresh);
  };

  const addToShopping = async (promo: Promotion) => {
    setChosen(null);
    if (await run(() => api.promoToShopping(promo.id))) toast(`Dodano do zakupów: ${promo.name}`);
  };

  if (promos === null || status === null) return <p className="muted center">Ładowanie…</p>;

  const stores = [...new Set(promos.map((p) => p.store))];
  const categories = CATEGORIES.filter(([key]) => promos.some((p) => p.category === key));
  const term = fold(q.trim());
  const shown = promos.filter((p) => !hidden.has(p.store) && !hiddenCats.has(p.category));
  const aisles = [...new Map(shown.map((p) => [p.aisle, p.aisle_order])).entries()].sort((a, b) => a[1] - b[1]).map(([name]) => name);
  const aisle = aisles.includes(onlyAisle) ? onlyAisle : "";
  const visible = shown.filter(
    (p) => (!aisle || p.aisle === aisle) && (!term || fold(`${p.name} ${p.ingredient} ${p.aisle}`).includes(term)),
  );
  const favoritesOn = visible.filter((p) => p.favorite).sort((a, b) => b.discount - a.discount);
  const row = (p: Promotion, withStore = false) => (
    <li key={p.id}>
      <button type="button" className="promo-row" onClick={() => setChosen(p)}>
        {p.image_url ? (
          <img className="promo-thumb" src={p.image_url} alt="" loading="lazy" />
        ) : (
          <span className="promo-thumb promo-icon" aria-hidden="true">
            {itemIcon(p)}
          </span>
        )}
        <span className="grow">
          {p.favorite && "⭐ "}
          {p.name}
          {(withStore || p.note || p.valid_to || p.valid_from) && (
            <span className="muted small promo-meta">
              {[withStore && p.store, p.note, validLabel(p.valid_from, p.valid_to)].filter(Boolean).join(" · ")}
            </span>
          )}
        </span>
        <span className="promo-price">
          <strong>{p.price}</strong>
          {p.discount > 0 && <span className="promo-discount">-{p.discount}%</span>}
        </span>
      </button>
    </li>
  );
  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };
  const failed = status.leaflets.filter((l) => l.status === "failed");

  return (
    <>
      <header className="topbar">
        <h1>Promocje</h1>
      </header>
      <p className="muted small">
        {[status.stores.join(", "), checkedLabel(status)].filter(Boolean).join(" · ")}
        {aiEnabled && status.stores.length > 0 && !status.running && (
          <>
            {" · "}
            <button type="button" className="link small" onClick={refresh}>
              ↻ Sprawdź teraz
            </button>
          </>
        )}
      </p>
      {!aiEnabled && <p className="error small">Promocje z gazetek wymagają klucza do AI (opcje dodatku).</p>}
      {status.errors.map((e) => (
        <p key={e} className="error small">
          {e}
        </p>
      ))}

      {promos.length === 0 ? (
        <p className="muted center">
          {status.running
            ? "AI czyta nowe gazetki – to potrwa kilka minut."
            : "Nie ma jeszcze promocji. Aplikacja sprawdza gazetki co 12 godzin – możesz też stuknąć „Sprawdź teraz”."}
        </p>
      ) : (
        <>
          <div className="search-field">
            <input
              ref={searchInput}
              type="search"
              enterKeyHint="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              placeholder="Szukaj, np. masło, kurczak…"
            />
            {q && (
              <button
                type="button"
                className="search-clear"
                aria-label="Wyczyść wyszukiwanie"
                // Bez tego pole straciłoby fokus i klawiatura na iPhonie by się schowała
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setQ("");
                  searchInput.current?.focus();
                }}
              >
                ×
              </button>
            )}
          </div>
          {(stores.length > 1 || categories.length > 1) && (
            <div className="chips">
              {stores.length > 1 &&
                stores.map((store) => (
                  <button key={store} type="button" className={`chip ${hidden.has(store) ? "" : "selected"}`} onClick={() => setHidden(toggle(hidden, store))}>
                    {store}
                  </button>
                ))}
              {categories.length > 1 &&
                categories.map(([key, name]) => (
                  <button key={key} type="button" className={`chip ${hiddenCats.has(key) ? "" : "selected"}`} onClick={() => setHiddenCats(toggle(hiddenCats, key))}>
                    {name}
                  </button>
                ))}
            </div>
          )}
          {aisles.length > 1 && (
            <select className="promo-aisle-select" value={aisle} onChange={(e) => setOnlyAisle(e.target.value)} aria-label="Dział">
              <option value="">Wszystkie działy</option>
              {aisles.map((name) => (
                <option key={name} value={name}>
                  {AISLE_ICONS[name] ?? "🛒"} {name}
                </option>
              ))}
            </select>
          )}
          <p className="small">
            🥕 Przepisy z tych produktów znajdziesz w <Link to="/co-ugotowac">Co ugotuję?</Link>
          </p>
          {favoritesOn.length > 0 && (
            <section className="promo-store">
              <h2>⭐ Ulubione w promocji</h2>
              <ul className="promo-list">{favoritesOn.map((p) => row(p, true))}</ul>
            </section>
          )}
          {stores
            .filter((store) => !hidden.has(store))
            .map((store) => {
              const items = visible.filter((p) => p.store === store && !p.favorite);
              if (!items.length) return null;
              return (
                <section key={store} className="promo-store">
                  <h2>{store}</h2>
                  {byAisle(items).map(([name, group]) => (
                    <div key={name}>
                      {!aisle && <h3 className="promo-aisle muted small">{name}</h3>}
                      <ul className="promo-list">{group.map((p) => row(p))}</ul>
                    </div>
                  ))}
                </section>
              );
            })}
          {visible.length === 0 && <p className="muted center">Nic nie pasuje do filtrów.</p>}
        </>
      )}

      {failed.length > 0 && (
        <details className="small muted">
          <summary>Nieodczytane gazetki ({failed.length})</summary>
          <ul>
            {failed.map((l) => (
              <li key={l.url}>
                {l.store}: {l.title} – {l.error}
              </li>
            ))}
          </ul>
        </details>
      )}

      {chosen && (
        <Sheet title={chosen.name} onClose={() => setChosen(null)} list>
          {chosen.image_url && <img className="promo-photo" src={chosen.image_url} alt="" />}
          <p className="small">
            <strong>{chosen.price}</strong>
            {chosen.discount > 0 && ` (-${chosen.discount}%)`} · {chosen.store}
            {chosen.note && ` · ${chosen.note}`}
            {validLabel(chosen.valid_from, chosen.valid_to) && ` · ${validLabel(chosen.valid_from, chosen.valid_to)}`}
          </p>
          <p className="muted small">Gazetka: {chosen.leaflet}</p>
          <button type="button" className="sheet-row" onClick={() => addToShopping(chosen)}>
            🛒 Dodaj do listy zakupów
          </button>
          <button type="button" className="sheet-row" onClick={() => toggleFavorite(chosen).then(() => setChosen(null))}>
            {favorites.includes(chosen.key) ? `☆ Usuń z ulubionych (${chosen.key})` : `⭐ Ulubione: ${chosen.key} – pokazuj na górze, każda marka`}
          </button>
        </Sheet>
      )}
    </>
  );
}
