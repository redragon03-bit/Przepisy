import { useEffect, useState } from "react";
import { api, PromoIdeas } from "../api";
import { useToast } from "../lib/toast";
import NewRecipeCard from "./NewRecipeCard";
import Sheet from "./Sheet";

// Nowe obiady od AI z produktów w promocji (np. "z Lidla", "szybko, bez ryb").
// AI pracuje w tle - co 2 sekundy pytamy o wynik. Spodobany przepis zapisujesz jednym przyciskiem.
// `initial`: sklepy wybrane już w sekcji "Z promocji" (pusto = wszystkie)
export default function PromoIdeasSheet({ stores, initial = [], onClose }: { stores: string[]; initial?: string[]; onClose: () => void }) {
  const [chosen, setChosen] = useState<Set<string>>(new Set(initial));
  const [wishes, setWishes] = useState("");
  const [ideas, setIdeas] = useState<PromoIdeas | null>(null);
  const { run } = useToast();

  const running = ideas?.status === "running";
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(async () => {
      const fresh = await api.getPromoIdeas(ideas.id).catch((e: Error) => ({ ...ideas, status: "failed" as const, error: e.message }));
      setIdeas(fresh);
    }, 2000);
    return () => clearInterval(timer);
  }, [running, ideas]);

  const toggle = (store: string) => {
    const next = new Set(chosen);
    if (next.has(store)) next.delete(store);
    else next.add(store);
    setChosen(next);
  };

  const ask = async () => {
    const started = await run(() => api.promoIdeas(wishes, [...chosen]));
    if (started) setIdeas(started);
  };

  return (
    <Sheet title="✨ Pomysły z promocji" onClose={onClose} list>
      {!ideas || ideas.status === "failed" ? (
        <>
          {stores.length > 1 && (
            <>
              <p className="muted small">Z których sklepów? (nic nie zaznaczysz = ze wszystkich)</p>
              <div className="chips">
                {stores.map((store) => (
                  <button key={store} type="button" className={`chip ${chosen.has(store) ? "selected" : ""}`} onClick={() => toggle(store)}>
                    {store}
                  </button>
                ))}
              </div>
            </>
          )}
          <input value={wishes} onChange={(e) => setWishes(e.target.value)} placeholder="Życzenia, np. szybko, bez ryb, dla dzieci" />
          {ideas?.error && <p className="error small">{ideas.error}</p>}
          <button type="button" className="primary wide" onClick={ask}>
            Zaproponuj 3 obiady
          </button>
        </>
      ) : running ? (
        <p className="muted">AI wymyśla obiady z produktów w promocji… (zwykle do minuty)</p>
      ) : (
        <>
          {ideas.text && <p className="small">{ideas.text}</p>}
          {ideas.recipes.map((recipe, i) => (
            <NewRecipeCard key={i} recipe={recipe} />
          ))}
          <button type="button" className="link small" onClick={() => setIdeas(null)}>
            ↺ Inne pomysły
          </button>
        </>
      )}
    </Sheet>
  );
}
