import { useEffect, useRef, useState } from "react";

const THRESHOLD = 60;

// "Przeciągnij w dół, żeby odświeżyć" - na iPhonie w aplikacji z ekranu głównego
// nie ma przycisku odświeżania. Zwraca, jak mocno lista jest pociągnięta i czy trwa odświeżanie.
export function usePullToRefresh(onRefresh: () => Promise<unknown>) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;

  useEffect(() => {
    let startY: number | null = null;
    let distance = 0;
    const start = (e: TouchEvent) => {
      startY = window.scrollY <= 0 ? e.touches[0].clientY : null;
      distance = 0;
    };
    const move = (e: TouchEvent) => {
      if (startY === null) return;
      if (window.scrollY > 0) {
        startY = null;
        setPull(0);
        return;
      }
      distance = Math.max(0, (e.touches[0].clientY - startY) / 2);
      setPull(Math.min(distance, THRESHOLD + 20));
    };
    const end = () => {
      if (startY !== null && distance >= THRESHOLD) {
        setRefreshing(true);
        refresh.current().finally(() => setRefreshing(false));
      }
      startY = null;
      setPull(0);
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", end);
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
    };
  }, []);

  return { pull, refreshing, ready: pull >= THRESHOLD };
}
