import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const EDGE = 28; // tyle pikseli od lewej krawędzi musi zacząć się gest
const DISTANCE = 80; // tyle trzeba przesunąć palec, żeby cofnąć

// Przesunięcie palcem od lewej krawędzi ekranu = "Wróć", jak w aplikacjach iPhone'a.
// Aplikacja dodana do ekranu początkowego nie ma tego gestu z Safari, więc robimy go sami.
// Zwraca, jak daleko przesunięto palec (do pokazania strzałki).
export function useEdgeSwipeBack(): number {
  const navigate = useNavigate();
  const location = useLocation();
  const [offset, setOffset] = useState(0);
  const path = useRef(location.pathname);
  path.current = location.pathname;

  useEffect(() => {
    let start: { x: number; y: number } | null = null;
    let dx = 0;
    const onStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      // Tryb gotowania ma własne przesuwanie (kroki), a na głównych zakładkach nie ma dokąd wracać
      const canGoBack = (window.history.state?.idx ?? 0) > 0 && !path.current.endsWith("/gotuj");
      start = canGoBack && touch.clientX <= EDGE ? { x: touch.clientX, y: touch.clientY } : null;
      dx = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!start) return;
      const touch = e.touches[0];
      dx = touch.clientX - start.x;
      // Ruch bardziej w pionie niż w poziomie to przewijanie, nie gest
      if (Math.abs(touch.clientY - start.y) > Math.max(30, Math.abs(dx))) {
        start = null;
        setOffset(0);
        return;
      }
      setOffset(Math.max(0, Math.min(dx, DISTANCE + 20)));
    };
    const onEnd = () => {
      if (start && dx >= DISTANCE) navigate(-1);
      start = null;
      setOffset(0);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [navigate]);

  return offset;
}

export const SWIPE_BACK_DISTANCE = DISTANCE;
