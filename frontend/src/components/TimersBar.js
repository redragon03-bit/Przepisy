import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link, useLocation } from "react-router-dom";
import { formatClock } from "../lib/timers";
import { useTimers } from "../lib/useTimers";
// Ostatnia minuta zmienia kolor na bursztynowy - widać kątem oka, że zaraz trzeba podejść
const SOON_MS = 60_000;
// Etykieta "Naleśniki, krok 2: 10 min" -> mała linia z przepisem i duża z krokiem
function splitLabel(label) {
    const at = label.lastIndexOf(", krok ");
    return at > 0 ? [label.slice(0, at), label.slice(at + 2)] : ["", label];
}
// Pasek minutników na dole ekranu - widoczny na każdym ekranie aplikacji.
// Ciemna pastylka z dużym czasem i paskiem postępu; przyciski 48 px: "+1 min" i zamknij.
export default function TimersBar() {
    const { timers, now, remove, extend } = useTimers();
    const location = useLocation();
    if (!timers.length)
        return null;
    return (_jsx("div", { className: `timers ${location.pathname.endsWith("/gotuj") ? "cooking-timers" : ""}`, role: "region", "aria-label": "Minutniki", children: timers.map((t) => (_jsx(TimerPill, { timer: t, now: now, here: location.pathname === `/przepis/${t.recipeId}`, onExtend: () => extend(t.id, 60), onClose: () => remove(t.id) }, t.id))) }));
}
function TimerPill({ timer: t, now, here, onExtend, onClose }) {
    const left = t.endsAt - now;
    const state = t.done ? "finished" : left <= SOON_MS ? "soon" : "";
    const progress = t.total ? Math.min(1, Math.max(0, 1 - left / (t.total * 1000))) : 0;
    const [recipe, step] = splitLabel(t.label);
    const text = (_jsxs(_Fragment, { children: [recipe && (_jsxs("small", { children: [recipe, _jsx("span", { className: "sr-only", children: ", " })] })), _jsx("b", { children: step })] }));
    return (_jsxs("div", { className: `timer ${state}`, style: { "--p": progress }, role: t.done ? "alert" : undefined, children: [t.recipeId && !here ? (_jsx(Link, { className: "timer-label", to: `/przepis/${t.recipeId}`, children: text })) : (_jsx("span", { className: "timer-label", children: text })), _jsx("strong", { className: "timer-time", "aria-live": "off", children: t.done ? "Gotowe!" : formatClock(left / 1000) }), _jsx("button", { type: "button", className: "timer-btn", onClick: onExtend, "aria-label": "Dodaj minut\u0119", children: "+1" }), _jsx("button", { type: "button", className: "timer-btn", onClick: onClose, "aria-label": "Zamknij minutnik", children: "\u2715" })] }));
}
