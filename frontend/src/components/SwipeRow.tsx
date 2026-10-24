import { ReactNode, TouchEvent, useRef, useState } from "react";

const DELETE_AT = 90; // tyle pikseli w lewo usuwa pozycję

// Wiersz listy, który przesunięty palcem w lewo się usuwa (jak w aplikacjach iPhone'a).
export default function SwipeRow({ className, onClick, onDelete, children }: {
  className?: string;
  onClick: () => void;
  onDelete: () => void;
  children: ReactNode;
}) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; swiping: boolean } | null>(null);
  // Czy ostatni dotyk był przesunięciem - wtedy "kliknięcie" na jego końcu nie odhacza pozycji
  const moved = useRef(false);

  const onTouchStart = (e: TouchEvent) => {
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, swiping: false };
    moved.current = false;
  };
  const onTouchMove = (e: TouchEvent) => {
    const from = start.current;
    if (!from) return;
    const moveX = e.touches[0].clientX - from.x;
    const moveY = e.touches[0].clientY - from.y;
    // Przewijanie listy w pionie nie przesuwa wiersza
    if (!from.swiping && Math.abs(moveY) > Math.abs(moveX)) {
      start.current = null;
      return;
    }
    from.swiping = from.swiping || Math.abs(moveX) > 8;
    moved.current = from.swiping;
    setDx(Math.min(0, moveX));
  };
  const onTouchEnd = () => {
    const swiped = dx <= -DELETE_AT;
    start.current = null;
    setDx(0);
    if (swiped) onDelete();
  };

  return (
    <li className={`swipe-row ${className ?? ""}`}>
      <span className={`swipe-delete ${dx <= -DELETE_AT ? "ready" : ""}`} aria-hidden="true">
        Usuń
      </span>
      <div
        className="swipe-content"
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dx ? "none" : undefined }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={() => {
          // Kliknięcie po przesunięciu to koniec gestu, nie odhaczenie
          if (!moved.current) onClick();
        }}
      >
        {children}
      </div>
    </li>
  );
}
