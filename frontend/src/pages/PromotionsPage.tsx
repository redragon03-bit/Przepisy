import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, Promotion, PromoStatus } from "../api";
import Sheet from "../components/Sheet";
import { validLabel } from "../lib/promo";
import { fold } from "../lib/stepIngredients";
import { useToast } from "../lib/toast";

// "Promocje": produkty spożywcze w promocji z gazetek, pogrupowane na sklepy.
// Serwer sam co 12 godzin sprawdza nowe gazetki (Lidl ze strony Lidla, reszta z Blixa)
// i AI wybiera z nich jedzenie. Stuknięcie produktu: dodanie do listy zakupów.
// Przepisy z produktami w promocji są na ekranie "Co ugotuję?".

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
  // Sklepy ukryte na liście (stuknięcie w sklep go chowa/pokazuje)
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [chosen, setChosen] = useState<Promotion | null>(null);
  const { toast, run } = useToast();

  const load = () => {
    api.listPromotions().then(setPromos, () => setPromos([]));
    api.promoStatus().then(setStatus, () => {});
  };
  useEffect(load, []);

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
  const term = fold(q.trim());
  const visible = promos.filter(
    (p) => !hidden.has(p.store) && (!term || fold(`${p.name} ${p.ingredient}`).includes(term)),
  );
  const toggleStore = (store: string) => {
    const next = new Set(hidden);
    if (next.has(store)) next.delete(store);
    else next.add(store);
    setHidden(next);
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
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Szukaj, np. masło, kurczak…" />
          </div>
          {stores.length > 1 && (
            <div className="chips">
              {stores.map((store) => (
                <button key={store} type="button" className={`chip ${hidden.has(store) ? "" : "selected"}`} onClick={() => toggleStore(store)}>
                  {store}
                </button>
              ))}
            </div>
          )}
          <p className="small">
            🥕 Przepisy z tych produktów znajdziesz w <Link to="/co-ugotowac">Co ugotuję?</Link>
          </p>
          {stores
            .filter((store) => !hidden.has(store))
            .map((store) => {
              const items = visible.filter((p) => p.store === store);
              if (!items.length) return null;
              return (
                <section key={store} className="promo-store">
                  <h2>{store}</h2>
                  <ul className="promo-list">
                    {items.map((p) => (
                      <li key={p.id}>
                        <button type="button" className="promo-row" onClick={() => setChosen(p)}>
                          <span className="grow">
                            {p.name}
                            {(p.note || p.valid_to || p.valid_from) && (
                              <span className="muted small promo-meta">
                                {[p.note, validLabel(p.valid_from, p.valid_to)].filter(Boolean).join(" · ")}
                              </span>
                            )}
                          </span>
                          <strong className="promo-price">{p.price}</strong>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          {visible.length === 0 && <p className="muted center">Nic nie pasuje do wyszukiwania.</p>}
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
          <p className="small">
            <strong>{chosen.price}</strong> · {chosen.store}
            {chosen.note && ` · ${chosen.note}`}
            {validLabel(chosen.valid_from, chosen.valid_to) && ` · ${validLabel(chosen.valid_from, chosen.valid_to)}`}
          </p>
          <p className="muted small">Gazetka: {chosen.leaflet}</p>
          <button type="button" className="sheet-row" onClick={() => addToShopping(chosen)}>
            🛒 Dodaj do listy zakupów
          </button>
        </Sheet>
      )}
    </>
  );
}
