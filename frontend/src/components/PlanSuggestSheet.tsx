import { useEffect, useState } from "react";
import { api, PlanSuggestion } from "../api";
import { dayLabel, shortDayLabel } from "../lib/days";
import { shoppingMessage } from "../lib/shopping";
import { useToast } from "../lib/toast";
import Sheet from "./Sheet";

// Plan obiadów od AI: wybierasz dni i życzenia ("raz ryba, do 40 minut"), AI dobiera
// Twoje przepisy, Ty usuwasz to, co nie pasuje, i zapisujesz (od razu też do zakupów).
export default function PlanSuggestSheet({ days, onSaved, onClose }: {
  // Dni do wyboru (RRRR-MM-DD) i te zaznaczone na start (bez planu)
  days: { day: string; free: boolean }[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState(() => new Set(days.filter((d) => d.free).map((d) => d.day)));
  const [wishes, setWishes] = useState("");
  const [suggestion, setSuggestion] = useState<PlanSuggestion | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast, run } = useToast();

  // AI układa plan w tle - co 2 sekundy pytamy o wynik
  const running = suggestion?.status === "running";
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(async () => {
      const fresh = await api.getPlanSuggestion(suggestion.id).catch((e: Error) => ({ ...suggestion, status: "failed" as const, error: e.message }));
      setSuggestion(fresh);
    }, 2000);
    return () => clearInterval(timer);
  }, [running, suggestion]);

  const toggle = (day: string) => {
    const next = new Set(chosen);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    setChosen(next);
  };

  const ask = async () => {
    const started = await run(() => api.suggestPlan([...chosen].sort(), wishes));
    if (started) setSuggestion(started);
  };

  const drop = (day: string) => suggestion && setSuggestion({ ...suggestion, days: suggestion.days.filter((d) => d.day !== day) });

  const save = async (withShopping: boolean) => {
    if (!suggestion) return;
    setSaving(true);
    const saved = await run(async () => {
      for (const d of suggestion.days) await api.addToPlan(d.day, d.recipe.id);
      if (!withShopping) return "Plan zapisany.";
      const sorted = suggestion.days.map((d) => d.day).sort();
      return shoppingMessage(await api.addPlanToShopping(sorted[0], sorted[sorted.length - 1]));
    });
    setSaving(false);
    if (saved) {
      toast(saved);
      onSaved();
    }
  };

  return (
    <Sheet title="✨ Plan obiadów od AI" onClose={onClose} list>
      {!suggestion || suggestion.status === "failed" ? (
        <>
          <p className="muted small">Na które dni?</p>
          <div className="chips">
            {days.map(({ day }) => (
              <button key={day} type="button" className={`chip ${chosen.has(day) ? "selected" : ""}`} onClick={() => toggle(day)}>
                {shortDayLabel(day)}
              </button>
            ))}
          </div>
          <input value={wishes} onChange={(e) => setWishes(e.target.value)} placeholder="Życzenia, np. raz ryba, do 40 minut, z tego, co mam" />
          {suggestion?.error && <p className="error small">{suggestion.error}</p>}
          <button type="button" className="primary wide" disabled={!chosen.size} onClick={ask}>
            Zaproponuj
          </button>
        </>
      ) : running ? (
        <p className="muted">AI układa plan z Twoich przepisów… (zwykle do minuty)</p>
      ) : (
        <>
          {suggestion.text && <p className="small">{suggestion.text}</p>}
          <ul className="plan-proposal">
            {suggestion.days.map((d) => (
              <li key={d.day} className="row">
                <div className="grow">
                  <span className="muted small">{dayLabel(d.day)}</span>
                  <br />
                  <strong>{d.recipe.title}</strong>
                  {d.reason && <span className="muted small"> · {d.reason}</span>}
                </div>
                <button type="button" className="icon" aria-label="Usuń z propozycji" onClick={() => drop(d.day)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="primary wide" disabled={saving || !suggestion.days.length} onClick={() => save(true)}>
            📅 Zapisz plan i 🛒 dodaj do zakupów
          </button>
          <button type="button" className="wide" disabled={saving || !suggestion.days.length} onClick={() => save(false)}>
            Zapisz tylko plan
          </button>
          <button type="button" className="link small" onClick={() => setSuggestion(null)}>
            ↺ Inna propozycja
          </button>
        </>
      )}
    </Sheet>
  );
}
