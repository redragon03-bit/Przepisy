import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { api } from "../api";
import { useToast } from "../lib/toast";
import NewRecipeCard from "./NewRecipeCard";
import Sheet from "./Sheet";
// Nowe obiady od AI z produktów w promocji (np. "z Lidla", "szybko, bez ryb").
// AI pracuje w tle - co 2 sekundy pytamy o wynik. Spodobany przepis zapisujesz jednym przyciskiem.
export default function PromoIdeasSheet({ stores, onClose }) {
    const [chosen, setChosen] = useState(new Set());
    const [wishes, setWishes] = useState("");
    const [ideas, setIdeas] = useState(null);
    const { run } = useToast();
    const running = ideas?.status === "running";
    useEffect(() => {
        if (!running)
            return;
        const timer = setInterval(async () => {
            const fresh = await api.getPromoIdeas(ideas.id).catch((e) => ({ ...ideas, status: "failed", error: e.message }));
            setIdeas(fresh);
        }, 2000);
        return () => clearInterval(timer);
    }, [running, ideas]);
    const toggle = (store) => {
        const next = new Set(chosen);
        if (next.has(store))
            next.delete(store);
        else
            next.add(store);
        setChosen(next);
    };
    const ask = async () => {
        const started = await run(() => api.promoIdeas(wishes, [...chosen]));
        if (started)
            setIdeas(started);
    };
    return (_jsx(Sheet, { title: "\u2728 Pomys\u0142y z promocji", onClose: onClose, list: true, children: !ideas || ideas.status === "failed" ? (_jsxs(_Fragment, { children: [stores.length > 1 && (_jsxs(_Fragment, { children: [_jsx("p", { className: "muted small", children: "Z kt\u00F3rych sklep\u00F3w? (nic nie zaznaczysz = ze wszystkich)" }), _jsx("div", { className: "chips", children: stores.map((store) => (_jsx("button", { type: "button", className: `chip ${chosen.has(store) ? "selected" : ""}`, onClick: () => toggle(store), children: store }, store))) })] })), _jsx("input", { value: wishes, onChange: (e) => setWishes(e.target.value), placeholder: "\u017Byczenia, np. szybko, bez ryb, dla dzieci" }), ideas?.error && _jsx("p", { className: "error small", children: ideas.error }), _jsx("button", { type: "button", className: "primary wide", onClick: ask, children: "Zaproponuj 3 obiady" })] })) : running ? (_jsx("p", { className: "muted", children: "AI wymy\u015Bla obiady z produkt\u00F3w w promocji\u2026 (zwykle do minuty)" })) : (_jsxs(_Fragment, { children: [ideas.text && _jsx("p", { className: "small", children: ideas.text }), ideas.recipes.map((recipe, i) => (_jsx(NewRecipeCard, { recipe: recipe }, i))), _jsx("button", { type: "button", className: "link small", onClick: () => setIdeas(null), children: "\u21BA Inne pomys\u0142y" })] })) }));
}
