import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// Panel wysuwany od dołu ekranu (jak "Więcej" na pasku zakładek). Stuknięcie obok zamyka.
// Zamiast wielu przycisków na ekranie rzadziej używane akcje chowamy w takim panelu.
export default function Sheet({ title, onClose, children, list }) {
    return (_jsx("div", { className: "sheet-backdrop", onClick: onClose, children: _jsxs("div", { className: `sheet ${list ? "sheet-list" : ""}`, onClick: (e) => e.stopPropagation(), role: "dialog", "aria-label": title, children: [title && _jsx("p", { className: "sheet-title", children: title }), children] }) }));
}
// Kafelek w panelu: ikona + podpis
export function SheetTile({ icon, label, onClick, danger }) {
    return (_jsxs("button", { type: "button", className: `sheet-tile ${danger ? "danger-tile" : ""}`, onClick: onClick, children: [_jsx("span", { children: icon }), label] }));
}
