// Serwer chwilowo niedostępny (aktualizacja dodatku, restart HA): zamiast pustego ekranu
// aplikacja pokazuje „Trwa aktualizacja”, co kilka sekund pyta /api/health i sama się
// przeładowuje, gdy serwer wróci (wtedy wczytuje się też nowa wersja aplikacji).
import { useSyncExternalStore } from "react";

const RETRY_MS = 3000;

let down = false;
let since = 0;
let checking = false;
// Po „Pracuj bez połączenia” nie zasłaniamy aplikacji przez kilka minut
let quietUntil = 0;
const QUIET_MS = 5 * 60 * 1000;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function setDown(value: boolean) {
  if (down === value) return;
  down = value;
  since = value ? Date.now() : 0;
  for (const listener of listeners) listener();
}

// Odpowiedź od pośrednika (Tailscale, HA), a nie od aplikacji: 502/503/504 bez JSON-a z `detail`.
// Aplikacja też czasem zwraca 502 (np. błąd AI), ale zawsze z opisem w `detail`.
export function isProxyError(status: number, detail: unknown) {
  return (status === 502 || status === 503 || status === 504) && typeof detail !== "string";
}

async function healthy(): Promise<boolean> {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

async function check() {
  if (checking) return;
  checking = true;
  clearTimeout(timer);
  const ok = await healthy();
  checking = false;
  if (!ok) {
    // Bez internetu (np. w sklepie) to nie jest aktualizacja - lista zakupów działa z pamięci
    if (navigator.onLine) setDown(true);
    if (down) timer = setTimeout(check, RETRY_MS);
    return;
  }
  if (down) {
    // Serwer wrócił - najpierw nowa wersja aplikacji (service worker), potem przeładowanie
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      await registration?.update();
    } catch {
      // bez service workera wystarczy przeładowanie
    }
    // W formularzu przepisu nie przeładowujemy - wpisany tekst by przepadł, można teraz zapisać
    if (/\/(edytuj|nowy)$/.test(location.pathname)) setDown(false);
    else location.reload();
  }
}

// Zapytanie do API skończyło się błędem pośrednika albo brakiem połączenia - sprawdzamy, czy serwer żyje
export function reportServerProblem() {
  if (!down && Date.now() > quietUntil) void check();
}

export function retryNow() {
  void check();
}

// Przycisk „Pracuj bez połączenia” - np. lista zakupów z pamięci telefonu
export function dismissServerDown() {
  clearTimeout(timer);
  quietUntil = Date.now() + QUIET_MS;
  setDown(false);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useServerDown(): { down: boolean; since: number } {
  const isDown = useSyncExternalStore(subscribe, () => down);
  return { down: isDown, since };
}
