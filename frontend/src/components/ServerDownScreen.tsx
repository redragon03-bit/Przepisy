import { useEffect, useState } from "react";
import { savedAuth } from "../api";
import DragonCooking from "./DragonCooking";
import { dismissServerDown, retryNow, useServerDown } from "../lib/serverStatus";

// Co 5 s zmienia się żartobliwy dopisek pod tytułem - smok na queście (D&D + kuchnia).
// Kolejność losowana przy każdym pokazaniu ekranu, bez powtórek, dopóki lista się nie skończy.
const QUEST_LINES = [
  "Walczę z goblinem, który podjadał ser…",
  "Szukam legendarnej przyprawy…",
  "Otwieram skrzynię z łupami: nowe funkcje…",
  "+50 PD za cierpliwość…",
  "Targuję się z krasnoludem o tłuczek do schabowych…",
  "Przekradam się obok trolla śpiącego w spiżarni…",
  "Rozbrajam pułapkę w szufladzie ze sztućcami…",
  "Ten garnek to był mimik! Już po nim…",
  "Zbieram zioła w Mrocznym Lesie… i natkę pietruszki",
  "Elf radzi dodać szczyptę soli…",
  "Rzucam „Wykrycie magii” na lodówkę…",
  "Wykradam przepis z wieży nekromanty…",
  "Drużyna rozbija obóz przy ognisku pod kotłem…",
  "Mapa skarbów prowadzi prosto do lodówki…",
  "Odpieram atak szczurów na zapasy mąki…",
  "Biorę zlecenie z tablicy w karczmie…",
  "Paladyn błogosławi gulasz…",
  "Kostka k20 potoczyła się pod piec… szukam…",
  "Liczę złoto w skarbcu… i ziemniaki",
  "Awans na wyższy poziom: Mistrz Rosołu…",
  "Rzut obronny na oparzenie… udany!",
  "Czarodziej zaklina pokrywkę, żeby nie kipiało…",
];
const LINE_SECONDS = 5;

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Pełny ekran na czas aktualizacji dodatku / restartu serwera - zamiast czarnego ekranu.
// Leży nad aplikacją (nic pod spodem nie znika), sam sprawdza serwer co kilka sekund.
export default function ServerDownScreen() {
  const { down, since } = useServerDown();
  const [now, setNow] = useState(() => Date.now());
  const [lines] = useState(() => shuffled(QUEST_LINES));

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
      <p className="server-down-stir">{lines[Math.floor(seconds / LINE_SECONDS) % lines.length]}</p>
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
