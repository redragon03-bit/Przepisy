import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, isoDay } from "../api";
import PlanSuggestSheet from "../components/PlanSuggestSheet";
import Sheet from "../components/Sheet";
import { nextDays } from "../lib/days";
import { shoppingMessage } from "../lib/shopping";
import { useToast } from "../lib/toast";
// Poniedziałek tygodnia, w którym jest `date`
function mondayOf(date) {
    const monday = new Date(date);
    monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return monday;
}
function addDays(date, days) {
    const result = new Date(date);
    result.setDate(date.getDate() + days);
    return result;
}
// Plan posiłków na tydzień: przepisy na każdy dzień + lista zakupów z całego tygodnia.
// "Zaplanuj z AI" układa obiady z zapisanych przepisów.
export default function PlanPage({ aiEnabled }) {
    const [monday, setMonday] = useState(() => mondayOf(new Date()));
    const [entries, setEntries] = useState([]);
    const [addingTo, setAddingTo] = useState(null);
    const [q, setQ] = useState("");
    const [results, setResults] = useState([]);
    const [message, setMessage] = useState("");
    const [suggesting, setSuggesting] = useState(false);
    // Pozycja planu, dla której wybieramy liczbę porcji
    const [servingsFor, setServingsFor] = useState(null);
    const { run } = useToast();
    const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    const start = isoDay(days[0]);
    const end = isoDay(days[6]);
    const refresh = () => api.listPlan(start, end).then(setEntries);
    useEffect(() => {
        refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [start]);
    // Wyszukiwarka przepisów przy dodawaniu do dnia
    useEffect(() => {
        if (addingTo === null)
            return;
        const timer = setTimeout(() => api.listRecipes(q, []).then((r) => setResults(r.slice(0, 20))), 250);
        return () => clearTimeout(timer);
    }, [q, addingTo]);
    const add = async (recipe) => {
        if (!(await run(() => api.addToPlan(addingTo, recipe.id))))
            return;
        setAddingTo(null);
        setQ("");
        refresh();
    };
    const toShopping = async () => {
        const result = await run(() => api.addPlanToShopping(start, end));
        if (!result)
            return;
        setMessage(result.added || result.skipped.length ? shoppingMessage(result) : "W tym tygodniu nic nie jest zaplanowane.");
    };
    const today = isoDay(new Date());
    const range = `${days[0].toLocaleDateString("pl-PL", { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}`;
    return (_jsxs(_Fragment, { children: [_jsxs("header", { className: "topbar", children: [_jsx("button", { type: "button", className: "link", onClick: () => setMonday(addDays(monday, -7)), "aria-label": "Poprzedni tydzie\u0144", children: "\u2039" }), _jsx("h1", { children: range }), _jsx("button", { type: "button", className: "link", onClick: () => setMonday(addDays(monday, 7)), "aria-label": "Nast\u0119pny tydzie\u0144", children: "\u203A" })] }), days.map((day) => {
                const key = isoDay(day);
                const planned = entries.filter((e) => e.day === key);
                return (_jsxs("section", { className: `box plan-day ${key === today ? "today" : ""}`, children: [_jsxs("div", { className: "row", children: [_jsx("h2", { children: day.toLocaleDateString("pl-PL", { weekday: "long", day: "numeric" }) }), _jsx("button", { type: "button", className: "link", onClick: () => setAddingTo(addingTo === key ? null : key), children: addingTo === key ? "Anuluj" : "+ Dodaj" })] }), planned.map((entry) => (_jsxs("div", { className: "row plan-entry", children: [_jsx(Link, { to: `/przepis/${entry.recipe.id}`, className: "grow", children: entry.recipe.title }), entry.base_servings && (_jsxs("button", { type: "button", className: "link muted small", onClick: () => setServingsFor(entry), "aria-label": "Liczba porcji", children: [entry.servings ?? entry.base_servings, " por."] })), _jsx("button", { type: "button", className: "icon", "aria-label": "Usu\u0144 z planu", onClick: async () => {
                                        await run(() => api.removeFromPlan(entry.id));
                                        refresh();
                                    }, children: "\u2715" })] }, entry.id))), addingTo === key && (_jsxs("div", { children: [_jsx("input", { type: "search", value: q, onChange: (e) => setQ(e.target.value), placeholder: "Szukaj przepisu\u2026", autoFocus: true }), _jsx("ul", { className: "suggestions", children: results.map((r) => (_jsx("li", { children: _jsxs("button", { type: "button", onClick: () => add(r), children: [r.favorite ? "❤️ " : "", r.title] }) }, r.id))) })] }))] }, key));
            }), aiEnabled && (_jsx("button", { type: "button", className: "wide", onClick: () => setSuggesting(true), children: "\u2728 Zaplanuj z AI" })), _jsx("button", { type: "button", className: "primary wide", onClick: toShopping, children: "\uD83D\uDED2 Sk\u0142adniki z tygodnia do listy zakup\u00F3w" }), message && _jsx("p", { className: "muted small center", children: message }), servingsFor && (_jsx(Sheet, { title: "Na ile porcji?", onClose: () => setServingsFor(null), list: true, children: Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (_jsxs("button", { type: "button", className: "sheet-row", onClick: async () => {
                        setServingsFor(null);
                        if (await run(() => api.setPlanServings(servingsFor.id, n)))
                            refresh();
                    }, children: [n, " ", n === (servingsFor.servings ?? servingsFor.base_servings) ? "✓" : "", n === servingsFor.base_servings ? _jsx("span", { className: "muted small", children: " (jak w przepisie)" }) : null] }, n))) })), suggesting && (_jsx(PlanSuggestSheet
            // Dni oglądanego tygodnia od dziś (tydzień miniony: najbliższe 7 dni); na start zaznaczone te bez planu
            , { 
                // Dni oglądanego tygodnia od dziś (tydzień miniony: najbliższe 7 dni); na start zaznaczone te bez planu
                days: (days.some((d) => isoDay(d) >= today) ? days.map(isoDay).filter((day) => day >= today) : nextDays().map((d) => d.day)).map((day) => ({ day, free: !entries.some((e) => e.day === day) })), onClose: () => setSuggesting(false), onSaved: () => {
                    setSuggesting(false);
                    refresh();
                } }))] }));
}
