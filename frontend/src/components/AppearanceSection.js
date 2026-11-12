import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { applyScales, clampScale, DEFAULT_SCALES, deviceLabel, loadScales, saveScales, SCALE_GROUPS, SCALE_MAX, SCALE_MIN, SCALE_STEP, scalesSummary, } from "../lib/uiScale";
// Ustawienia → Wygląd: każda grupa czcionek, kółka i odstępy osobno, co 5%.
// Zmiana działa od razu; po chwili trafia też do logu dodatku na serwerze (żeby było wiadomo, co jest ustawione).
export default function AppearanceSection() {
    const [scales, setScales] = useState(loadScales);
    const [saved, setSaved] = useState("");
    const first = useRef(true);
    useEffect(() => {
        applyScales(scales);
        saveScales(scales);
        if (first.current) {
            first.current = false;
            return;
        }
        const timer = setTimeout(() => {
            api
                .saveAppearance(scales, deviceLabel())
                .then((r) => setSaved(new Date(r.saved_at).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })))
                .catch(() => setSaved(""));
        }, 800);
        return () => clearTimeout(timer);
    }, [scales]);
    const change = (key, delta) => setScales((s) => ({ ...s, [key]: clampScale(s[key] + delta) }));
    return (_jsxs("section", { className: "box", children: [_jsx("h2", { children: "Wygl\u0105d" }), _jsxs("p", { className: "muted small", children: ["Wielko\u015B\u0107 ka\u017Cdej grupy osobno, co ", SCALE_STEP, "%. Zmiana dzia\u0142a od razu i dotyczy tego telefonu."] }), _jsx("ul", { className: "scale-list", children: SCALE_GROUPS.map((g) => (_jsxs("li", { children: [_jsxs("span", { className: "grow", children: [g.label, _jsx("span", { className: "muted small block", children: g.hint })] }), _jsxs("span", { className: "stepper", children: [_jsx("button", { type: "button", onClick: () => change(g.key, -SCALE_STEP), disabled: scales[g.key] <= SCALE_MIN, "aria-label": `${g.label}: mniejsze`, children: "\u2212" }), _jsxs("output", { className: "scale-value", "aria-label": `${g.label}: wielkość`, children: [scales[g.key], "%"] }), _jsx("button", { type: "button", onClick: () => change(g.key, SCALE_STEP), disabled: scales[g.key] >= SCALE_MAX, "aria-label": `${g.label}: większe`, children: "+" })] })] }, g.key))) }), _jsxs("p", { className: "small scale-summary", children: ["Ustawione teraz: ", _jsx("b", { children: scalesSummary(scales) }), saved && _jsxs("span", { className: "muted", children: [" \u00B7 zapisane w logu ", saved] })] }), _jsx("button", { type: "button", className: "small", onClick: () => setScales({ ...DEFAULT_SCALES }), disabled: scalesSummary(scales) === scalesSummary(DEFAULT_SCALES), children: "Przywr\u00F3\u0107 100%" })] }));
}
