import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, CookMatch, PantryItem, PromoRecipe } from "../api";
import { expiresLabel, inDays, USE_FIRST_DAYS } from "../components/ExpirySheet";
import PromoIdeasSheet from "../components/PromoIdeasSheet";
import RecipeCard from "../components/RecipeCard";
import { useHiddenPromoStores } from "../lib/promoBadges";
import { usePromotions } from "../lib/usePromotions";

// "Co mogę ugotować?" - przepisy z produktów ze spiżarni (Zakupy → W domu).
// Spiżarnię zmienia się w Zakupach: odhaczone kupione, dopisane ręcznie, z paragonu.
// Starsze wersje trzymały wybór w przeglądarce - przenosimy go raz do spiżarni.
const OLD_STORAGE_KEY = "cook-ingredients";

function takeOldSelection(): string[] {
  try {
    const old = JSON.parse(localStorage.getItem(OLD_STORAGE_KEY) ?? "[]");
    localStorage.removeItem(OLD_STORAGE_KEY);
    return Array.isArray(old) ? old : [];
  } catch {
    return [];
  }
}

// Tyle przepisów z promocjami pokazujemy od razu (reszta po "Pokaż wszystkie")
const PROMO_PREVIEW = 4;

// "Z promocji": Twoje przepisy ze składnikami w promocji i nowe pomysły od AI
function PromoSection({ aiEnabled }: { aiEnabled: boolean }) {
  const promos = usePromotions();
  const [recipes, setRecipes] = useState<PromoRecipe[] | null>(null);
  const [all, setAll] = useState(false);
  const [ideasOpen, setIdeasOpen] = useState(false);
  // Sklepy odznaczone (tutaj albo w Promocjach - to ten sam wybór), zapamiętane w telefonie
  const [hidden, setHidden] = useHiddenPromoStores();

  useEffect(() => {
    api.promoRecipes().then(setRecipes, () => setRecipes([]));
  }, []);

  if (!promos.length || recipes === null) return null;
  const stores = [...new Set(promos.map((p) => p.store))];
  const toggleStore = (store: string) => {
    const next = new Set(hidden);
    if (next.has(store)) next.delete(store);
    else next.add(store);
    setHidden(next);
  };
  // Tylko promocje z widocznych sklepów; przepis bez nich znika z sekcji
  const visible = recipes
    .map((m) => ({ ...m, promos: m.promos.filter((p) => !hidden.has(p.store)) }))
    .filter((m) => m.promos.length > 0);
  const shown = all ? visible : visible.slice(0, PROMO_PREVIEW);
  return (
    <section className="box">
      <h2>🏷️ Z promocji</h2>
      <p className="muted small">
        Twoje przepisy ze składnikami, które są teraz w promocji. Wszystkie produkty: <Link to="/promocje">Promocje</Link>.
      </p>
      {stores.length > 1 && (
        <div className="chips">
          {stores.map((store) => (
            <button key={store} type="button" className={`chip ${hidden.has(store) ? "" : "selected"}`} onClick={() => toggleStore(store)}>
              {store}
            </button>
          ))}
        </div>
      )}
      {visible.length === 0 ? (
        <p className="muted small">Żaden z Twoich przepisów nie ma teraz składników w promocji{hidden.size ? " w wybranych sklepach" : ""}.</p>
      ) : (
        <div className="grid">
          {shown.map((m) => (
            <RecipeCard key={m.recipe.id} recipe={m.recipe}>
              <span className="small promo-badge card-tag">🏷️ {m.promos.map((p) => `${p.ingredient} (${p.label})`).join(", ")}</span>
            </RecipeCard>
          ))}
        </div>
      )}
      {visible.length > PROMO_PREVIEW && (
        <button type="button" className="link small" onClick={() => setAll(!all)}>
          {all ? "Pokaż mniej" : `Pokaż wszystkie (${visible.length})`}
        </button>
      )}
      {aiEnabled && (
        <button type="button" className="wide" onClick={() => setIdeasOpen(true)}>
          ✨ Nowe pomysły z promocji
        </button>
      )}
      {ideasOpen && <PromoIdeasSheet stores={stores} initial={hidden.size ? stores.filter((s) => !hidden.has(s)) : []} onClose={() => setIdeasOpen(false)} />}
    </section>
  );
}

export default function CookPage({ aiEnabled }: { aiEnabled: boolean }) {
  const [items, setItems] = useState<PantryItem[] | null>(null);
  const [maxMissing, setMaxMissing] = useState(1);
  const [matches, setMatches] = useState<CookMatch[] | null>(null);

  useEffect(() => {
    const old = takeOldSelection();
    api.pantryItems().then((pantry) => {
      if (!pantry.length && old.length) api.addToPantry(old).then(setItems);
      else setItems(pantry);
    });
  }, []);

  useEffect(() => {
    if (!items?.length) {
      setMatches(null);
      return;
    }
    api.whatCanICook(items.map((i) => i.name), maxMissing).then(setMatches);
  }, [items, maxMissing]);

  if (items === null) return <p className="muted center">Ładowanie…</p>;

  const soon = inDays(USE_FIRST_DAYS);
  const urgent = items.filter((i) => i.expires && i.expires <= soon).sort((a, b) => a.expires!.localeCompare(b.expires!));

  return (
    <>
      <header className="topbar">
        <h1>Co ugotuję?</h1>
      </header>
      <section className="box">
        <h2>Moja spiżarnia</h2>
        {items.length === 0 ? (
          <p className="muted small">
            Spiżarnia jest pusta. Odhaczaj kupione na liście zakupów albo dopisz, co masz w domu:{" "}
            <Link to="/zakupy?widok=dom">Zakupy → W domu</Link>.
          </p>
        ) : (
          <p className="small">
            Szukam przepisów z {items.length} {items.length === 1 ? "produktu" : "produktów"} ze spiżarni ·{" "}
            <Link to="/zakupy?widok=dom">Zmień</Link>
          </p>
        )}
        {urgent.length > 0 && (
          <p className="small use-first">⏰ Zużyj najpierw: {urgent.map((i) => `${i.name} (${expiresLabel(i.expires!)})`).join(", ")}</p>
        )}
        <label className="row small">
          Może brakować:
          <select value={maxMissing} onChange={(e) => setMaxMissing(Number(e.target.value))}>
            <option value={0}>nic</option>
            <option value={1}>1 składnika</option>
            <option value={2}>2 składników</option>
            <option value={3}>3 składników</option>
          </select>
        </label>
      </section>

      <PromoSection aiEnabled={aiEnabled} />

      {matches === null ? null : matches.length === 0 ? (
        <p className="muted center">Brak pasujących przepisów. Dopisz produkty do spiżarni albo zwiększ liczbę braków.</p>
      ) : (
        <div className="grid">
          {matches.map((m) => (
            <RecipeCard key={m.recipe.id} recipe={m.recipe}>
              {m.use_first.length > 0 && <span className="small use-first">⏰ zużyje: {m.use_first.join(", ")}</span>}
              {m.missing.length === 0 ? (
                <span className="ok small">Masz wszystko!</span>
              ) : (
                <span className="small missing-line">Brakuje: {m.missing.join(", ")}</span>
              )}
            </RecipeCard>
          ))}
        </div>
      )}
    </>
  );
}
