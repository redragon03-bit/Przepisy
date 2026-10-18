import { useEffect, useState } from "react";
import { api, CookMatch } from "../api";
import IngredientPicker from "../components/IngredientPicker";
import RecipeCard from "../components/RecipeCard";

// "Co mogę ugotować?" - wybierasz składniki, które masz, i dostajesz pasujące przepisy.
// Wybrane składniki to spiżarnia zapisana na serwerze: lista zakupów je pomija,
// a czat bierze je pod uwagę.
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

export default function CookPage() {
  const [have, setHave] = useState<string[] | null>(null);
  const [maxMissing, setMaxMissing] = useState(1);
  const [matches, setMatches] = useState<CookMatch[] | null>(null);

  useEffect(() => {
    api.getPantry().then((pantry) => {
      const old = takeOldSelection();
      if (!pantry.length && old.length) api.setPantry(old).then(setHave);
      else setHave(pantry);
    });
  }, []);

  useEffect(() => {
    if (!have?.length) {
      setMatches(null);
      return;
    }
    api.whatCanICook(have, maxMissing).then(setMatches);
  }, [have, maxMissing]);

  const change = async (names: string[]) => {
    setHave(names);
    setHave(await api.setPantry(names));
  };

  if (have === null) return <p className="muted center">Ładowanie…</p>;

  return (
    <>
      <header className="topbar">
        <h1>Co ugotuję?</h1>
      </header>
      <section className="box">
        <h2>Moja spiżarnia</h2>
        <p className="muted small">
          Wpisz, co masz w domu. Aplikacja to zapamięta: lista zakupów pominie te produkty, a czat weźmie je pod uwagę. Sól, pieprz,
          olej itp. są liczone jako „zawsze w domu” (zmienisz to w Ustawieniach).
        </p>
        <IngredientPicker value={have} onChange={change} placeholder="np. jajko, pomidor…" />
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
