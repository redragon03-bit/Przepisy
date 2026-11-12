import { PointerEvent, useEffect, useRef, useState } from "react";

// Zmiana kolejności na liście przez przeciągnięcie palcem za uchwyt (numer kroku, ⠿ przy składniku i sekcji).
// Zwraca: który wiersz jest przeciągany, ref dla wierszy i właściwości dla uchwytu.
//
// Ruch palca śledzimy na całym oknie, a nie na samym uchwycie: po zamianie wierszy React może
// podmienić element pod palcem (np. krok <-> nagłówek sekcji) i wtedy uchwyt gubi zdarzenia.
// Na iPhonie Safari potrafi zacząć przewijać stronę mimo touch-action: none, więc w trakcie
// przeciągania blokujemy też touchmove (nasłuchiwanie niepasywne).
export function useReorder<T>(items: T[], onChange: (items: T[]) => void) {
  const [dragging, setDragging] = useState<number | null>(null);
  const rows = useRef<(HTMLElement | null)[]>([]);
  // Najnowsze wartości dla nasłuchiwania na oknie (bez czekania na ponowne renderowanie)
  const latest = useRef({ items, onChange, dragging });
  latest.current = { items, onChange, dragging: latest.current.dragging };

  useEffect(() => {
    if (dragging === null) return;
    const move = (clientY: number) => {
      const from = latest.current.dragging;
      if (from === null) return;
      // Zamieniamy z sąsiednim wierszem, gdy palec minie jego środek (bez "skakania" przy różnych wysokościach)
      const neighbour = (i: number) => rows.current[i]?.getBoundingClientRect();
      const below = neighbour(from + 1);
      const above = neighbour(from - 1);
      let to = from;
      if (below && clientY > below.top + below.height / 2) to = from + 1;
      else if (above && clientY < above.top + above.height / 2) to = from - 1;
      if (to === from) return;
      const next = [...latest.current.items];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      latest.current.items = next;
      latest.current.dragging = to;
      latest.current.onChange(next);
      setDragging(to);
    };
    const onPointerMove = (e: globalThis.PointerEvent) => move(e.clientY);
    const stop = () => {
      latest.current.dragging = null;
      setDragging(null);
    };
    const blockScroll = (e: TouchEvent) => e.preventDefault();
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("touchmove", blockScroll, { passive: false });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("touchmove", blockScroll);
    };
    // Nasłuchiwanie zakładamy raz na całe przeciąganie (start/koniec), nie przy każdej zamianie
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging === null]);

  const handle = (index: number) => ({
    onPointerDown: (e: PointerEvent) => {
      e.preventDefault();
      // Bez przechwytywania: wtedy zdarzenia trafiają do elementów pod palcem i bąbelkują do okna
      const target = e.currentTarget as Element;
      if (target.hasPointerCapture?.(e.pointerId)) target.releasePointerCapture(e.pointerId);
      latest.current.dragging = index;
      setDragging(index);
    },
    style: { touchAction: "none" as const, cursor: "grab" },
  });

  const rowRef = (index: number) => (el: HTMLElement | null) => {
    rows.current[index] = el;
  };
  rows.current.length = items.length;

  return { dragging, rowRef, handle };
}
