import { useEffect, useState } from "react";
import { savedAuth } from "../api";
import { dismissServerDown, retryNow, useServerDown } from "../lib/serverStatus";

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
      <div className="server-down-spinner" aria-hidden="true">
        🔄
      </div>
      <h1 id="server-down-title">Trwa aktualizacja</h1>
      <p>Serwer aplikacji jest chwilowo niedostępny - zwykle to aktualizacja albo restart Home Assistanta.</p>
      <p className="muted">Aplikacja sama się odświeży, gdy serwer wróci. Czekam {elapsed}…</p>
      <button type="button" className="primary" onClick={retryNow}>
        Spróbuj teraz
      </button>
      {canWorkOffline && (
        <button type="button" onClick={dismissServerDown}>
          Pracuj bez połączenia
        </button>
      )}
    </div>
  );
}
