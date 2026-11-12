import { jsx as _jsx } from "react/jsx-runtime";
// Ocena 1-5. Kliknięcie w aktualną ocenę ją usuwa.
export default function Stars({ value, onChange }) {
    return (_jsx("span", { className: "stars", "aria-label": value ? `Ocena ${value} na 5` : "Bez oceny", children: [1, 2, 3, 4, 5].map((n) => onChange ? (_jsx("button", { type: "button", className: "link", onClick: () => onChange(n === value ? 0 : n), children: value && n <= value ? "★" : "☆" }, n)) : (_jsx("span", { children: value && n <= value ? "★" : "☆" }, n))) }));
}
