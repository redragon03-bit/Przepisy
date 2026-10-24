import { ReactNode } from "react";

// Panel wysuwany od dołu ekranu (jak "Więcej" na pasku zakładek). Stuknięcie obok zamyka.
// Zamiast wielu przycisków na ekranie rzadziej używane akcje chowamy w takim panelu.
export default function Sheet({ title, onClose, children, list }: { title?: string; onClose: () => void; children: ReactNode; list?: boolean }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className={`sheet ${list ? "sheet-list" : ""}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        {title && <p className="sheet-title">{title}</p>}
        {children}
      </div>
    </div>
  );
}

// Kafelek w panelu: ikona + podpis
export function SheetTile({ icon, label, onClick, danger }: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" className={`sheet-tile ${danger ? "danger-tile" : ""}`} onClick={onClick}>
      <span>{icon}</span>
      {label}
    </button>
  );
}
