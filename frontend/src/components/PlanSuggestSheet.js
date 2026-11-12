import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { api } from "../api";
import { dayLabel, shortDayLabel } from "../lib/days";
import { shoppingMessage } from "../lib/shopping";
import { useToast } from "../lib/toast";
import Sheet from "./Sheet";
// Plan obiadów od AI: wybierasz dni i życzenia ("raz ryba, do 40 minut"), AI dobiera
// Twoje przepisy, Ty usuwasz to, co nie pasuje, i zapisujesz (od razu też do zakupów).
export default function PlanSuggestSheet({ days, onSaved, onClose }) {
    const [chosen, setChosen] = useState(() => new Set(days.filter((d) => d.free).map((d) => d.day)));
    const [wishes, setWishes] = useState("");
    const [suggestion, setSuggestion] = useState(null);
    const [saving, setSaving] = useState(false);
    const { toast, run } = useToast();
    // AI układa plan w tle - co 2 sekundy pytamy o wynik
    const running = suggestion?.status === "running";
    useEffect(() => {
        if (!running)
            return;
        const timer = setInterval(async () => {
            const fresh = await api.getPlanSuggestion(suggestion.id).catch((e) => ({ ...suggestion, status: "failed", error: e.message }));
            setSuggestion(fresh);
        }, 2000);
        return () => clearInterval(timer);
    }, [running, suggestion]);
    const toggle = (day) => {
        const next = new Set(chosen);
        if (next.has(day))
            next.delete(day);
        else
            next.add(day);
        setChosen(next);
    };
    const ask = async () => {
        const started = await run(() => api.suggestPlan([...chosen].sort(), wishes));
        if (started)
            setSuggestion(started);
    };
    const drop = (day) => suggestion && setSuggestion({ ...suggestion, days: suggestion.days.filter((d) => d.day !== day) });
    const save = async (withShopping) => {
        if (!suggestion)
            return;
        setSaving(true);
        const saved = await run(async () => {
            for (const d of suggestion.days)
                await api.addToPlan(d.day, d.recipe.id);
            if (!withShopping)
                return "Plan zapisany.";
            const sorted = suggestion.days.map((d) => d.day).sort();
            return shoppingMessage(await api.addPlanToShopping(sorted[0], sorted[sorted.length - 1]));
        });
        setSaving(false);
        if (saved) {
            toast(saved);
            onSaved();
        }
    };
    return (_jsx(Sheet, { title: "\u2728 Plan obiad\u00F3w od AI", onClose: onClose, list: true, children: !suggestion || suggestion.status === "failed" ? (_jsxs(_Fragment, { children: [_jsx("p", { className: "muted small", children: "Na kt\u00F3re dni?" }), _jsx("div", { className: "chips", children: days.map(({ day }) => (_jsx("button", { type: "button", className: `chip ${chosen.has(day) ? "selected" : ""}`, onClick: () => toggle(day), children: shortDayLabel(day) }, day))) }), _jsx("input", { value: wishes, onChange: (e) => setWishes(e.target.value), placeholder: "\u017Byczenia, np. raz ryba, do 40 minut, z tego, co mam" }), suggestion?.error && _jsx("p", { className: "error small", children: suggestion.error }), _jsx("button", { type: "button", className: "primary wide", disabled: !chosen.size, onClick: ask, children: "Zaproponuj" })] })) : running ? (_jsx("p", { className: "muted", children: "AI uk\u0142ada plan z Twoich przepis\u00F3w\u2026 (zwykle do minuty)" })) : (_jsxs(_Fragment, { children: [suggestion.text && _jsx("p", { className: "small", children: suggestion.text }), _jsx("ul", { className: "plan-proposal", children: suggestion.days.map((d) => (_jsxs("li", { className: "row", children: [_jsxs("div", { className: "grow", children: [_jsx("span", { className: "muted small", children: dayLabel(d.day) }), _jsx("br", {}), _jsx("strong", { children: d.recipe.title }), d.reason && _jsxs("span", { className: "muted small", children: [" \u00B7 ", d.reason] })] }), _jsx("button", { type: "button", className: "icon", "aria-label": "Usu\u0144 z propozycji", onClick: () => drop(d.day), children: "\u2715" })] }, d.day))) }), _jsx("button", { type: "button", className: "primary wide", disabled: saving || !suggestion.days.length, onClick: () => save(true), children: "\uD83D\uDCC5 Zapisz plan i \uD83D\uDED2 dodaj do zakup\u00F3w" }), _jsx("button", { type: "button", className: "wide", disabled: saving || !suggestion.days.length, onClick: () => save(false), children: "Zapisz tylko plan" }), _jsx("button", { type: "button", className: "link small", onClick: () => setSuggestion(null), children: "\u21BA Inna propozycja" })] })) }));
}
