import { PointerEvent, useRef, useState } from "react";

// Zmiana kolejności na liście przez przeciągnięcie palcem za uchwyt (numer kroku, ⠿ przy składniku).
// Zwraca: który wiersz jest przeciągany, ref dla wierszy i właściwości dla uchwytu.
export function useReorder<T>(items: T[], onChange: (items: T[]) => void) {
  const [dragging, setDragging] = useState<number | null>(null);
  const rows = useRef<(HTMLElement | null)[]>([]);

  const move = (from: number, to: number) => {
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  const handle = (index: number) => ({
    onPointerDown: (e: PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      setDragging(index);
    },
    onPointerMove: (e: PointerEvent) => {
      if (dragging === null) return;
      // Zamieniamy z sąsiednim wierszem, gdy palec minie jego środek (bez "skakania" przy różnych wysokościach)
      const neighbour = (i: number) => rows.current[i]?.getBoundingClientRect();
      const below = neighbour(dragging + 1);
      const above = neighbour(dragging - 1);
      if (below && e.clientY > below.top + below.height / 2) {
        move(dragging, dragging + 1);
        setDragging(dragging + 1);
      } else if (above && e.clientY < above.top + above.height / 2) {
        move(dragging, dragging - 1);
        setDragging(dragging - 1);
      }
    },
    onPointerUp: () => setDragging(null),
    onPointerCancel: () => setDragging(null),
    style: { touchAction: "none" as const, cursor: "grab" },
  });

  const rowRef = (index: number) => (el: HTMLElement | null) => {
    rows.current[index] = el;
  };
  rows.current.length = items.length;

  return { dragging, rowRef, handle };
}
