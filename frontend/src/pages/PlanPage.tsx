import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, isoDay, PlanEntry, RecipeSummary } from "../api";
import PlanSuggestSheet from "../components/PlanSuggestSheet";
import Sheet from "../components/Sheet";
import { nextDays } from "../lib/days";
import { shoppingMessage } from "../lib/shopping";
import { useToast } from "../lib/toast";

// Poniedziałek tygodnia, w którym jest `date`
function mondayOf(date: Date): Date {
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return monday;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(date.getDate() + days);
  return result;
}

// Plan posiłków na tydzień: przepisy na każdy dzień + lista zakupów z całego tygodnia.
// "Zaplanuj z AI" układa obiady z zapisanych przepisów.
export default function PlanPage({ aiEnabled }: { aiEnabled: boolean }) {
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [entries, setEntries] = useState<PlanEntry[]>([]);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<RecipeSummary[]>([]);
  const [message, setMessage] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  // Pozycja planu, dla której wybieramy liczbę porcji
  const [servingsFor, setServingsFor] = useState<PlanEntry | null>(null);
  const { run } = useToast();

  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const start = isoDay(days[0]);
  const end = isoDay(days[6]);

  const refresh = () => api.listPlan(start, end).then(setEntries);
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  // Wyszukiwarka przepisów przy dodawaniu do dnia
  useEffect(() => {
    if (addingTo === null) return;
    const timer = setTimeout(() => api.listRecipes(q, []).then((r) => setResults(r.slice(0, 20))), 250);
    return () => clearTimeout(timer);
  }, [q, addingTo]);

  const add = async (recipe: RecipeSummary) => {
    if (!(await run(() => api.addToPlan(addingTo!, recipe.id)))) return;
    setAddingTo(null);
    setQ("");
    refresh();
  };

  const toShopping = async () => {
    const result = await run(() => api.addPlanToShopping(start, end));
    if (!result) return;
    setMessage(result.added || result.skipped.length ? shoppingMessage(result) : "W tym tygodniu nic nie jest zaplanowane.");
  };

  const today = isoDay(new Date());
  const range = `${days[0].toLocaleDateString("pl-PL", { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}`;

  return (
    <>
      <header className="topbar">
        <button type="button" className="link" onClick={() => setMonday(addDays(monday, -7))} aria-label="Poprzedni tydzień">
          ‹
        </button>
        <h1>{range}</h1>
        <button type="button" className="link" onClick={() => setMonday(addDays(monday, 7))} aria-label="Następny tydzień">
          ›
        </button>
      </header>

      {days.map((day) => {
        const key = isoDay(day);
        const planned = entries.filter((e) => e.day === key);
        return (
          <section key={key} className={`box plan-day ${key === today ? "today" : ""}`}>
            <div className="row">
              <h2>{day.toLocaleDateString("pl-PL", { weekday: "long", day: "numeric" })}</h2>
              <button type="button" className="link" onClick={() => setAddingTo(addingTo === key ? null : key)}>
                {addingTo === key ? "Anuluj" : "+ Dodaj"}
              </button>
            </div>
            {planned.map((entry) => (
              <div key={entry.id} className="row plan-entry">
                <Link to={`/przepis/${entry.recipe.id}`} className="grow">
                  {entry.recipe.title}
                </Link>
                {entry.base_servings && (
                  <button type="button" className="link muted small" onClick={() => setServingsFor(entry)} aria-label="Liczba porcji">
                    {entry.servings ?? entry.base_servings} por.
                  </button>
                )}
                <button
                  type="button"
                  className="icon"
                  aria-label="Usuń z planu"
                  onClick={async () => {
                    await run(() => api.removeFromPlan(entry.id));
                    refresh();
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            {addingTo === key && (
              <div>
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Szukaj przepisu…" autoFocus />
                <ul className="suggestions">
                  {results.map((r) => (
                    <li key={r.id}>
                      <button type="button" onClick={() => add(r)}>
                        {r.favorite ? "❤️ " : ""}
                        {r.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        );
      })}

      {aiEnabled && (
        <button type="button" className="wide" onClick={() => setSuggesting(true)}>
          ✨ Zaplanuj z AI
        </button>
      )}
      <button type="button" className="primary wide" onClick={toShopping}>
        🛒 Składniki z tygodnia do listy zakupów
      </button>
      {message && <p className="muted small center">{message}</p>}
      {servingsFor && (
        <Sheet title="Na ile porcji?" onClose={() => setServingsFor(null)} list>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              className="sheet-row"
              onClick={async () => {
                setServingsFor(null);
                if (await run(() => api.setPlanServings(servingsFor.id, n))) refresh();
              }}
            >
              {n} {n === (servingsFor.servings ?? servingsFor.base_servings) ? "✓" : ""}
              {n === servingsFor.base_servings ? <span className="muted small"> (jak w przepisie)</span> : null}
            </button>
          ))}
        </Sheet>
      )}
      {suggesting && (
        <PlanSuggestSheet
          // Dni oglądanego tygodnia od dziś (tydzień miniony: najbliższe 7 dni); na start zaznaczone te bez planu
          days={(days.some((d) => isoDay(d) >= today) ? days.map(isoDay).filter((day) => day >= today) : nextDays().map((d) => d.day)).map(
            (day) => ({ day, free: !entries.some((e) => e.day === day) }),
          )}
          onClose={() => setSuggesting(false)}
          onSaved={() => {
            setSuggesting(false);
            refresh();
          }}
        />
      )}
    </>
  );
}
