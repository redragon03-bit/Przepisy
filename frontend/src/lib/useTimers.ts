import { useEffect, useState } from "react";
import { beep, unlockSound } from "./timers";

export interface Timer {
  id: number;
  label: string;
  endsAt: number; // Date.now() w milisekundach
  done: boolean;
}

// Minutniki kroków: co sekundę odświeżamy czas; skończony minutnik daje sygnał.
export function useTimers() {
  const [timers, setTimers] = useState<Timer[]>([]);
  const [now, setNow] = useState(Date.now());

  const running = timers.some((t) => !t.done);
  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => {
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
    }, 1000);
    return () => clearInterval(tick);
  }, [running]);

  const start = (label: string, seconds: number) => {
    unlockSound();
    setNow(Date.now());
    setTimers((list) => [...list, { id: Date.now(), label, endsAt: Date.now() + seconds * 1000, done: false }]);
  };

  const remove = (id: number) => setTimers((list) => list.filter((t) => t.id !== id));

  return { timers, now, start, remove };
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
