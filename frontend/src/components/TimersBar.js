import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link, useLocation } from "react-router-dom";
import { formatClock } from "../lib/timers";
import { useTimers } from "../lib/useTimers";
// Pasek minutników na dole ekranu - widoczny na każdym ekranie aplikacji
export default function TimersBar() {
    const { timers, now, remove } = useTimers();
    const location = useLocation();
    if (!timers.length)
        return null;
    return (_jsx("div", { className: `timers ${location.pathname.endsWith("/gotuj") ? "cooking-timers" : ""}`, children: timers.map((t) => {
            const label = _jsx("span", { children: t.label });
            return (_jsxs("div", { className: `timer ${t.done ? "finished" : ""}`, children: [t.recipeId && location.pathname !== `/przepis/${t.recipeId}` ? _jsx(Link, { to: `/przepis/${t.recipeId}`, children: label }) : label, _jsx("strong", { children: t.done ? "Gotowe!" : formatClock((t.endsAt - now) / 1000) }), _jsx("button", { type: "button", className: "link", onClick: () => remove(t.id), "aria-label": "Zamknij minutnik", children: "\u2715" })] }, t.id));
        }) }));
}
