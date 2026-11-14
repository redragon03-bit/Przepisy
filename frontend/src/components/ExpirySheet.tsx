import { useEffect, useState } from "react";
import { isoDay } from "../api";
import { dayLabel } from "../lib/days";
import Sheet from "./Sheet";

// Termin "do zużycia najpierw" (tak samo jak USE_FIRST_DAYS na serwerze)
export const USE_FIRST_DAYS = 3;

export function inDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return isoDay(date);
}

// "dziś", "jutro", "za 3 dni", "po terminie"
export function expiresLabel(expires: string): string {
  const days = Math.round((new Date(`${expires}T12:00`).getTime() - new Date(`${isoDay(new Date())}T12:00`).getTime()) / 86_400_000);
  if (days < 0) return "po terminie";
  if (days === 0) return "dziś";
  if (days === 1) return "jutro";
  return `za ${days} dni`;
}

// Panel produktu ze spiżarni: do kiedy zużyć, dopisz do zakupów, usuń.
export default function ExpirySheet({ name, expires, onTerm, onRemove, onToShopping, onRename, onClose }: {
  name: string;
  expires?: string;
  onTerm: (day: string | null) => void;
  onRemove: () => void;
  onToShopping?: () => void;
  onRename?: () => void;
  onClose: () => void;
}) {
  // Data wybierana w kalendarzu "Inna data" (zapisywana po jego zamknięciu)
  const [otherDay, setOtherDay] = useState(expires ?? "");
  useEffect(() => setOtherDay(expires ?? ""), [expires]);

  return (
    <Sheet title={expires ? `${name}: zużyć do ${dayLabel(expires)}` : `${name}: do kiedy zużyć?`} onClose={onClose} list>
      {[
        ["Dziś", 0],
        ["Jutro", 1],
        ["Za 3 dni", 3],
        ["Za tydzień", 7],
      ].map(([label, days]) => (
        <button key={label} type="button" className="sheet-row" onClick={() => onTerm(inDays(days as number))}>
          {label}
        </button>
      ))}
      <label className="sheet-row">
        Inna data:{" "}
        <input
          type="date"
          min={isoDay(new Date())}
          value={otherDay}
          // iPhone zmienia wartość już przy otwarciu kalendarza i przy każdym stuknięciu w dzień -
          // zapisujemy dopiero po zamknięciu kalendarza (pole traci fokus), inaczej okno znika,
          // zanim wybierzesz datę. Zmiana bez fokusu (np. inna przeglądarka) zapisuje się od razu.
          onChange={(e) => {
            setOtherDay(e.target.value);
            if (e.target.value && document.activeElement !== e.target) onTerm(e.target.value);
          }}
          onBlur={() => otherDay && otherDay !== expires && onTerm(otherDay)}
        />
      </label>
      {expires && (
        <button type="button" className="sheet-row" onClick={() => onTerm(null)}>
          Bez terminu
        </button>
      )}
      {onToShopping && (
        <button type="button" className="sheet-row" onClick={onToShopping}>
          🛒 Kończy się - dopisz do zakupów
        </button>
      )}
      {onRename && (
        <button type="button" className="sheet-row" onClick={onRename}>
          ✏️ Zmień nazwę
        </button>
      )}
      <button type="button" className="sheet-row danger-tile" onClick={onRemove}>
        🗑️ Zużyte - usuń ze spiżarni
      </button>
    </Sheet>
  );
}
