import { RefObject, useEffect } from "react";

// Powiększanie treści przepisu dwoma palcami, jak w Safari. Systemowe powiększanie jest wyłączone
// (maximum-scale=1 w index.html - inaczej iPhone przybliżał ekran przy wpisywaniu), więc robimy własne:
// CSS zoom na treści, tekst zawija się do szerokości ekranu. Wielkość zapamiętana w telefonie.
const KEY = "recipe-zoom";
const MIN = 0.8;
const MAX = 2;

export function savedRecipeZoom(): number {
  try {
    const value = Number(localStorage.getItem(KEY));
    return value >= MIN && value <= MAX ? value : 1;
  } catch {
    return 1;
  }
}

export function usePinchZoom(ref: RefObject<HTMLElement | null>, ready: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let zoom = savedRecipeZoom();
    el.style.setProperty("zoom", String(zoom));
    let start: { distance: number; zoom: number } | null = null;
    const distance = (e: TouchEvent) =>
      Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) start = { distance: distance(e), zoom };
    };
    const onMove = (e: TouchEvent) => {
      if (!start || e.touches.length !== 2) return;
      e.preventDefault(); // bez przewijania strony w trakcie gestu
      const next = Math.min(MAX, Math.max(MIN, start.zoom * (distance(e) / start.distance)));
      zoom = Math.round(next * 20) / 20; // co 5%
      el.style.setProperty("zoom", String(zoom));
    };
    const onEnd = (e: TouchEvent) => {
      if (!start || e.touches.length >= 2) return;
      start = null;
      try {
        localStorage.setItem(KEY, String(zoom));
      } catch {
        // tryb prywatny - bez zapamiętania
      }
    };
    // Safari: gest dwoma palcami nie może przybliżać całej strony
    const noGesture = (e: Event) => e.preventDefault();
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    el.addEventListener("gesturestart", noGesture);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      el.removeEventListener("gesturestart", noGesture);
    };
  }, [ref, ready]);
}
