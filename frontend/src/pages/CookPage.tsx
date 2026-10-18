import { useEffect, useState } from "react";
import { api, CookMatch } from "../api";
import IngredientPicker from "../components/IngredientPicker";
import RecipeCard from "../components/RecipeCard";

// "Co mogę ugotować?" - wybierasz składniki, które masz, i dostajesz pasujące przepisy.
// Wybrane składniki pamiętamy w przeglądarce, żeby nie wpisywać ich za każdym razem.
const STORAGE_KEY = "cook-ingredients";

function loadSaved(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export default function CookPage() {
  const [have, setHave] = useState<string[]>(loadSaved);
  const [maxMissing, setMaxMissing] = useState(1);
  const [matches, setMatches] = useState<CookMatch[] | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(have));
    } catch {
      // brak dostępu do pamięci przeglądarki - trudno, działa bez zapamiętywania
    }
    if (!have.length) {
      setMatches(null);
      return;
    }
    api.whatCanICook(have, maxMissing).then(setMatches);
  }, [have, maxMissing]);

  return (
    <>
      <header className="topbar">
        <h1>Co ugotuję?</h1>
      </header>
      <section className="box">
        <p className="muted small">Wpisz, co masz w lodówce. Sól, pieprz, olej itp. są liczone jako „zawsze w domu” (zmienisz to w Ustawieniach).</p>
        <IngredientPicker value={have} onChange={setHave} placeholder="np. jajko, pomidor…" />
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

      {matches === null ? null : matches.length === 0 ? (
        <p className="muted center">Brak pasujących przepisów. Spróbuj dodać składniki albo zwiększyć liczbę braków.</p>
      ) : (
        <div className="grid">
          {matches.map((m) => (
            <RecipeCard key={m.recipe.id} recipe={m.recipe}>
              {m.missing.length === 0 ? (
                <span className="ok small">Masz wszystko!</span>
              ) : (
                <span className="small">Brakuje: {m.missing.join(", ")}</span>
              )}
            </RecipeCard>
          ))}
        </div>
      )}
    </>
  );
}
