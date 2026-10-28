import { useEffect, useState } from "react";
import { api, CookMatch, isoDay, PantryItem } from "../api";
import IngredientPicker from "../components/IngredientPicker";
import RecipeCard from "../components/RecipeCard";
import Sheet from "../components/Sheet";
import { dayLabel } from "../lib/days";
import { useToast } from "../lib/toast";

// Termin "do zużycia najpierw" (tak samo jak USE_FIRST_DAYS na serwerze)
const USE_FIRST_DAYS = 3;

function inDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return isoDay(date);
}

// "dziś", "jutro", "za 3 dni", "po terminie"
function expiresLabel(expires: string): string {
  const days = Math.round((new Date(`${expires}T12:00`).getTime() - new Date(`${isoDay(new Date())}T12:00`).getTime()) / 86_400_000);
  if (days < 0) return "po terminie";
  if (days === 0) return "dziś";
  if (days === 1) return "jutro";
  return `za ${days} dni`;
}

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
  // Terminy zużycia produktów ze spiżarni: nazwa -> RRRR-MM-DD
  const [expires, setExpires] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const { run } = useToast();

  const applyItems = (items: PantryItem[]) =>
    setExpires(Object.fromEntries(items.filter((i) => i.expires).map((i) => [i.name, i.expires!])));

  useEffect(() => {
    api.getPantry().then((pantry) => {
      const old = takeOldSelection();
      if (!pantry.length && old.length) api.setPantry(old).then(setHave);
      else setHave(pantry);
    });
    api.pantryItems().then(applyItems);
  }, []);

  useEffect(() => {
    if (!have?.length) {
      setMatches(null);
      return;
    }
    api.whatCanICook(have, maxMissing).then(setMatches);
  }, [have, maxMissing, expires]);

  const change = async (names: string[]) => {
    setHave(names);
    setHave(await api.setPantry(names));
  };

  // Data wybierana w kalendarzu "Inna data" (zapisywana po jego zamknięciu)
  const [otherDay, setOtherDay] = useState("");
  useEffect(() => setOtherDay(editing ? (expires[editing] ?? "") : ""), [editing, expires]);

  const setTerm = async (name: string, day: string | null) => {
    setEditing(null);
    const items = await run(() => api.setPantryExpires(name, day));
    if (items) applyItems(items);
  };

  const remove = (name: string) => {
    setEditing(null);
    change(have!.filter((n) => n !== name));
  };

  if (have === null) return <p className="muted center">Ładowanie…</p>;

  const soon = inDays(USE_FIRST_DAYS);
  const urgent = have.filter((n) => expires[n] && expires[n] <= soon).sort((a, b) => expires[a].localeCompare(expires[b]));

  return (
    <>
      <header className="topbar">
        <h1>Co ugotuję?</h1>
      </header>
      <section className="box">
        <h2>Moja spiżarnia</h2>
        <p className="muted small">
          Wpisz, co masz w domu. Aplikacja to zapamięta: lista zakupów pominie te produkty, a czat weźmie je pod uwagę. Stuknij
          produkt, żeby ustawić, do kiedy trzeba go zużyć. Sól, pieprz, olej itp. są liczone jako „zawsze w domu” (zmienisz to w
          Ustawieniach).
        </p>
        <IngredientPicker
          value={have}
          onChange={change}
          placeholder="np. jajko, pomidor…"
          onChipClick={setEditing}
          chipLabel={(name) => (expires[name] && expires[name] <= soon ? `⏰ ${name}` : name)}
        />
        {urgent.length > 0 && (
          <p className="small use-first">
            ⏰ Zużyj najpierw: {urgent.map((n) => `${n} (${expiresLabel(expires[n])})`).join(", ")}
          </p>
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

      {matches === null ? null : matches.length === 0 ? (
        <p className="muted center">Brak pasujących przepisów. Spróbuj dodać składniki albo zwiększyć liczbę braków.</p>
      ) : (
        <div className="grid">
          {matches.map((m) => (
            <RecipeCard key={m.recipe.id} recipe={m.recipe}>
              {m.use_first.length > 0 && <span className="small use-first">⏰ zużyje: {m.use_first.join(", ")}</span>}
              {m.missing.length === 0 ? (
                <span className="ok small">Masz wszystko!</span>
              ) : (
                <span className="small">Brakuje: {m.missing.join(", ")}</span>
              )}
            </RecipeCard>
          ))}
        </div>
      )}

      {editing && (
        <Sheet title={expires[editing] ? `${editing}: zużyć do ${dayLabel(expires[editing])}` : `${editing}: do kiedy zużyć?`} onClose={() => setEditing(null)} list>
          {[
            ["Dziś", 0],
            ["Jutro", 1],
            ["Za 3 dni", 3],
            ["Za tydzień", 7],
          ].map(([label, days]) => (
            <button key={label} type="button" className="sheet-row" onClick={() => setTerm(editing, inDays(days as number))}>
              {label}
            </button>
          ))}
          <label className="sheet-row">
            Inna data:{" "}
            <input
              type="date"
              min={isoDay(new Date())}
              value={otherDay}
              onChange={(e) => setOtherDay(e.target.value)}
              // iPhone zmienia wartość już przy otwarciu kalendarza i przy każdym stuknięciu w dzień -
              // zapisujemy dopiero po zamknięciu kalendarza, inaczej okno znika, zanim wybierzesz datę
              onBlur={() => otherDay && otherDay !== expires[editing] && setTerm(editing, otherDay)}
            />
          </label>
          {expires[editing] && (
            <button type="button" className="sheet-row" onClick={() => setTerm(editing, null)}>
              Bez terminu
            </button>
          )}
          <button type="button" className="sheet-row danger-tile" onClick={() => remove(editing)}>
            🗑️ Usuń ze spiżarni
          </button>
        </Sheet>
      )}
    </>
  );
}
