import { useEffect, useState } from "react";
import { savedAuth } from "../api";
import DragonCooking from "./DragonCooking";
import { dismissServerDown, retryNow, useServerDown } from "../lib/serverStatus";

// Co kilka sekund zmienia się żartobliwy dopisek pod tytułem (D&D + smocza kuchnia)
const STIRRING = [
  "Rzucam k20 na przyprawy… naturalna dwudziestka!",
  "Dorzucam łuskę smoka dla smaku…",
  "Mag ognia podkręca płomień pod kotłem…",
  "Odnawiam komórki zaklęć i zapasy w spiżarni…",
  "Test Mądrości (Gotowanie)… sukces!",
  "Goblin podjadał ser, już go przegoniłem…",
  "Bard śpiewa zupie, żeby szybciej doszła…",
  "Otwieram skrzynię z łupami: nowe funkcje…",
  "+50 PD za cierpliwość…",
];

// Pełny ekran na czas aktualizacji dodatku / restartu serwera - zamiast czarnego ekranu.
// Leży nad aplikacją (nic pod spodem nie znika), sam sprawdza serwer co kilka sekund.
export default function ServerDownScreen() {
  const { down, since } = useServerDown();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!down) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [down]);

  if (!down) return null;
  const seconds = Math.max(0, Math.round((now - since) / 1000));
  const elapsed = seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
  // „Pracuj bez połączenia” ma sens, gdy telefon pamięta logowanie (lista zakupów, zapisane przepisy)
  const canWorkOffline = !!savedAuth()?.authenticated;

  return (
    <div className="server-down" role="alertdialog" aria-live="polite" aria-labelledby="server-down-title">
      <DragonCooking />
      <h1 id="server-down-title">Smok warzy nową miksturę</h1>
      <p className="server-down-lead">Trwa aktualizacja albo restart Home Assistanta. Karczma zaraz otworzy podwoje – świeża strawa już się grzeje.</p>
      <p className="server-down-stir">{STIRRING[Math.floor(seconds / 4) % STIRRING.length]}</p>
      <p className="muted">Zaglądam do kotła co kilka sekund i sama się odświeżę. Czekam {elapsed}.</p>
      <button type="button" className="primary" onClick={retryNow}>
        Zajrzyj do kotła
      </button>
      {canWorkOffline && (
        <button type="button" onClick={dismissServerDown}>
          Pracuj bez połączenia
        </button>
      )}
    </div>
  );
}
