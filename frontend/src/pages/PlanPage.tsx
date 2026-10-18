import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, isoDay, PlanEntry, RecipeSummary } from "../api";
import { shoppingMessage } from "../lib/shopping";

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
export default function PlanPage() {
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [entries, setEntries] = useState<PlanEntry[]>([]);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<RecipeSummary[]>([]);
  const [message, setMessage] = useState("");

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
    await api.addToPlan(addingTo!, recipe.id);
    setAddingTo(null);
    setQ("");
    refresh();
  };

  const toShopping = async () => {
    const result = await api.addPlanToShopping(start, end);
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
                <button
                  type="button"
                  className="icon"
                  aria-label="Usuń z planu"
                  onClick={async () => {
                    await api.removeFromPlan(entry.id);
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

      <button type="button" className="primary wide" onClick={toShopping}>
        🛒 Składniki z tygodnia do listy zakupów
      </button>
      {message && <p className="muted small center">{message}</p>}
    </>
  );
}
