import { DependencyList, useCallback, useEffect, useRef, useState } from "react";

// Dane ekranu zapamiętane w telefonie: przy wejściu pokazujemy od razu ostatnie wyniki,
// a świeże z serwera podmieniamy w tle. Przez Tailscale odpowiedź potrafi iść kilka sekund
// (albo wcale, gdy dodatek się aktualizuje) - wtedy ekran nie wisi na „Ładowanie…”.
const PREFIX = "screen-cache:";
// Po tylu sekundach bez odpowiedzi (i bez zapamiętanych danych) pokazujemy błąd z „Spróbuj ponownie”
export const SLOW_MS = 15_000;

export function readCached<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(PREFIX + key) ?? "null") as T | null;
  } catch {
    return null;
  }
}

function writeCached(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // tryb prywatny albo brak miejsca - działa, tylko bez zapamiętania
  }
}

export interface Cached<T> {
  data: T | null;
  // Komunikat, gdy nie ma ani świeżych, ani zapamiętanych danych
  error: string | null;
  reload: () => void;
  set: (value: T) => void;
}

// `key` null = nie pobieraj (np. brak danych wejściowych); zmiana klucza albo deps pobiera od nowa
export function useCachedLoad<T>(key: string | null, loader: () => Promise<T>, deps: DependencyList = []): Cached<T> {
  const [data, setData] = useState<T | null>(() => (key ? readCached<T>(key) : null));
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const dataRef = useRef(data);
  dataRef.current = data;
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    if (!key) {
      setData(null);
      return;
    }
    let alive = true;
    const saved = readCached<T>(key);
    if (saved !== null) setData(saved);
    setError(null);
    const slow = setTimeout(() => {
      if (alive && dataRef.current === null) setError("Serwer długo nie odpowiada - sprawdź połączenie (Tailscale) i spróbuj ponownie.");
    }, SLOW_MS);
    loaderRef.current().then(
      (fresh) => {
        if (!alive) return;
        clearTimeout(slow);
        setData(fresh);
        setError(null);
        writeCached(key, fresh);
      },
      (e) => {
        if (!alive) return;
        clearTimeout(slow);
        if (dataRef.current === null) setError(e instanceof Error ? e.message : "Nie udało się wczytać.");
      },
    );
    return () => {
      alive = false;
      clearTimeout(slow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt, ...deps]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const set = useCallback(
    (value: T) => {
      setData(value);
      if (key) writeCached(key, value);
    },
    [key],
  );
  return { data, error, reload, set };
}
