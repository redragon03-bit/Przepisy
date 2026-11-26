import { ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// Ile trzeba przeciągnąć w dół (px), żeby panel się zamknął
const CLOSE_AT = 80;

// Panel wysuwany od dołu ekranu (jak "Więcej" na pasku zakładek). Stuknięcie obok albo
// przeciągnięcie panelu w dół zamyka. Zamiast wielu przycisków na ekranie rzadziej
// używane akcje chowamy w takim panelu.
export default function Sheet({ title, onClose, children, list }: { title?: string; onClose: () => void; children: ReactNode; list?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const sheet = ref.current;
    const backdrop = sheet?.parentElement;
    if (!sheet || !backdrop) return;
    let startY = 0;
    let startScroll = 0;
    let dy = 0;
    let dragging = false;
    const start = (e: TouchEvent) => {
      startY = e.touches[0].clientY;
      startScroll = sheet.scrollTop;
      dy = 0;
      dragging = false;
    };
    // Nasłuch nie-pasywny: przy przeciąganiu panelu strona pod spodem nie może się przewijać (iPhone)
    const move = (e: TouchEvent) => {
      const delta = e.touches[0].clientY - startY;
      if (!dragging) {
        // Panel z długą listą najpierw przewija się do góry, dopiero potem daje się ściągnąć
        if (delta > 8 && startScroll <= 0 && sheet.scrollTop <= 0) {
          dragging = true;
          sheet.style.transition = "none";
        } else if (!sheet.contains(e.target as Node) || sheet.scrollHeight <= sheet.clientHeight) {
          // Tło i panel bez przewijania: nic pod spodem się nie rusza
          e.preventDefault();
          return;
        } else return;
      }
      e.preventDefault();
      dy = Math.max(0, delta);
      sheet.style.transform = `translateY(${dy}px)`;
    };
    const end = () => {
      if (!dragging) return;
      dragging = false;
      if (dy > CLOSE_AT) {
        sheet.style.transition = "transform 0.15s ease-in";
        sheet.style.transform = "translateY(100%)";
        setTimeout(() => close.current(), 150);
      } else {
        sheet.style.transition = "transform 0.2s ease-out";
        sheet.style.transform = "";
      }
    };
    backdrop.addEventListener("touchstart", start, { passive: true });
    backdrop.addEventListener("touchmove", move, { passive: false });
    backdrop.addEventListener("touchend", end);
    backdrop.addEventListener("touchcancel", end);
    return () => {
      backdrop.removeEventListener("touchstart", start);
      backdrop.removeEventListener("touchmove", move);
      backdrop.removeEventListener("touchend", end);
      backdrop.removeEventListener("touchcancel", end);
    };
  }, []);

  // Do <body>, żeby panel nie dziedziczył powiększenia treści przepisu (usePinchZoom) ani przesunięć rodzica
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div ref={ref} className={`sheet ${list ? "sheet-list" : ""}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        {title && <p className="sheet-title">{title}</p>}
        {children}
      </div>
    </div>,
    document.body,
  );
}

// Kafelek w panelu: ikona + podpis
// `active` - przełącznik włączony (np. "Nie wygaszaj: wł.")
export function SheetTile({ icon, label, onClick, danger, active }: { icon: string; label: string; onClick: () => void; danger?: boolean; active?: boolean }) {
  return (
    <button
      type="button"
      className={`sheet-tile ${danger ? "danger-tile" : ""} ${active ? "active" : ""}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <span>{icon}</span>
      {label}
    </button>
  );
}
