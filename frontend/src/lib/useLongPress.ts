import { MouseEvent, TouchEvent, useRef } from "react";

const LONG_PRESS_MS = 500;

// Przytrzymanie palcem (pół sekundy bez przesuwania) - otwiera dodatkowe akcje bez nowych przycisków.
// Zwraca obsługę zdarzeń do rozłożenia na elemencie: <li {...longPress}>.
// Puszczenie palca po przytrzymaniu nie wywołuje zwykłego stuknięcia (onClick).
export function useLongPress(onLongPress: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const pressed = useRef(false);

  return {
    onTouchStart: (e: TouchEvent) => {
      pressed.current = false;
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      timer.current = setTimeout(() => {
        pressed.current = true;
        navigator.vibrate?.(10);
        onLongPress();
      }, LONG_PRESS_MS);
    },
    onTouchMove: (e: TouchEvent) => {
      const from = start.current;
      // Przewijanie to nie przytrzymanie
      if (from && Math.hypot(e.touches[0].clientX - from.x, e.touches[0].clientY - from.y) > 10) clearTimeout(timer.current);
    },
    onTouchEnd: () => clearTimeout(timer.current),
    onContextMenu: (e: MouseEvent) => e.preventDefault(),
    // Wywołaj na początku onClick: true = to było przytrzymanie, nie stuknięcie
    wasLongPress: () => {
      const was = pressed.current;
      pressed.current = false;
      return was;
    },
  };
}
