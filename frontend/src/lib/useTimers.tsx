import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { beep, unlockSound } from "./timers";

export interface Timer {
  id: number;
  label: string;
  endsAt: number; // Date.now() w milisekundach
  done: boolean;
  // Przepis, z którego jest minutnik - stuknięcie w minutnik tam wraca
  recipeId?: number;
}

// Minutniki są wspólne dla całej aplikacji i zapisane w pamięci telefonu: działają dalej
// po przejściu do innego ekranu, a po powrocie do aplikacji (iPhone usypia ją w tle)
// od razu widać i słychać, że czas minął.
const STORAGE_KEY = "timers";

function loadTimers(): Timer[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

interface Timers {
  timers: Timer[];
  now: number;
  start: (label: string, seconds: number, recipeId?: number) => void;
  remove: (id: number) => void;
}

const TimersContext = createContext<Timers | null>(null);

export function useTimers(): Timers {
  const timers = useContext(TimersContext);
  if (!timers) throw new Error("useTimers działa tylko wewnątrz TimersProvider");
  return timers;
}

export function TimersProvider({ children }: { children: ReactNode }) {
  const [timers, setTimers] = useState<Timer[]>(loadTimers);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(timers));
    } catch {
      // tryb prywatny - minutniki działają, tylko bez zapamiętania
    }
  }, [timers]);

  const running = timers.some((t) => !t.done);
  useEffect(() => {
    if (!running) return;
    const check = () => {
      const current = Date.now();
      setNow(current);
      setTimers((list) =>
        list.map((t) => {
          if (!t.done && t.endsAt <= current) {
            beep();
            return { ...t, done: true };
          }
          return t;
        }),
      );
    };
    const tick = setInterval(check, 1000);
    // Po powrocie do aplikacji sprawdzamy od razu, nie czekając na kolejną sekundę
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [running]);

  const start = (label: string, seconds: number, recipeId?: number) => {
    unlockSound();
    setNow(Date.now());
    setTimers((list) => [...list, { id: Date.now(), label, endsAt: Date.now() + seconds * 1000, done: false, recipeId }]);
  };

  const remove = (id: number) => setTimers((list) => list.filter((t) => t.id !== id));

  return <TimersContext.Provider value={{ timers, now, start, remove }}>{children}</TimersContext.Provider>;
}

// "Nie wygaszaj ekranu" (Wake Lock). Zwraca false, gdy przeglądarka tego nie obsługuje.
export function useWakeLock(enabled: boolean, onFail?: () => void) {
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = () =>
      navigator.wakeLock
        .request("screen")
        .then((l) => {
          if (cancelled) l.release();
          else lock = l;
        })
        .catch(() => onFail?.());
    request();
    // iPhone zwalnia blokadę po przełączeniu aplikacji - po powrocie prosimy ponownie
    const onVisible = () => document.visibilityState === "visible" && request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release();
    };
  }, [enabled]);
}
