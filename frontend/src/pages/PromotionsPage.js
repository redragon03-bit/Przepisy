import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import Sheet from "../components/Sheet";
import { validLabel } from "../lib/promo";
import { fold } from "../lib/stepIngredients";
import { useToast } from "../lib/toast";
// "Promocje": jedzenie, pieluchy i środki czystości w promocji z gazetek, pogrupowane na sklepy.
// Serwer sam co 12 godzin sprawdza nowe gazetki (Lidl ze strony Lidla, reszta z Blixa)
// i AI wybiera z nich produkty; nocą czyta też obrazki stron głównych gazetek (ceny).
// Stuknięcie produktu: dodanie do listy zakupów.
// Przepisy z produktami w promocji są na ekranie "Co ugotuję?".
// Grupy produktów (kategoria z serwera) i ich przyciski nad listą
const CATEGORIES = [
    ["jedzenie", "🍎 Jedzenie"],
    ["dziecko", "👶 Dziecko"],
    ["czystosc", "🧽 Czystość"],
];
function checkedLabel(status) {
    if (status.running)
        return status.progress ? `czytam: ${status.progress}` : "sprawdzam gazetki…";
    if (!status.last_check)
        return "";
    const at = new Date(status.last_check);
    const time = at.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
    const sameDay = at.toDateString() === new Date().toDateString();
    return `sprawdzone ${sameDay ? "dziś" : at.toLocaleDateString("pl-PL", { day: "numeric", month: "numeric" })} ${time}`;
}
export default function PromotionsPage({ aiEnabled }) {
    const [promos, setPromos] = useState(null);
    const [status, setStatus] = useState(null);
    const [q, setQ] = useState("");
    // Sklepy ukryte na liście (stuknięcie w sklep go chowa/pokazuje)
    const [hidden, setHidden] = useState(new Set());
    // Grupy ukryte na liście (np. bez środków czystości)
    const [hiddenCats, setHiddenCats] = useState(new Set());
    const [chosen, setChosen] = useState(null);
    const { toast, run } = useToast();
    const load = () => {
        api.listPromotions().then(setPromos, () => setPromos([]));
        api.promoStatus().then(setStatus, () => { });
    };
    useEffect(load, []);
    // Sprawdzanie gazetek trwa w tle (AI czyta nowe gazetki) - co 5 sekund pytamy, czy skończyło
    const running = status?.running ?? false;
    useEffect(() => {
        if (!running)
            return;
        const timer = setInterval(async () => {
            const fresh = await api.promoStatus().catch(() => null);
            if (fresh && !fresh.running)
                load();
            else if (fresh)
                setStatus(fresh);
        }, 5000);
        return () => clearInterval(timer);
    }, [running]);
    const refresh = async () => {
        const fresh = await run(() => api.refreshPromotions());
        if (fresh)
            setStatus(fresh);
    };
    const addToShopping = async (promo) => {
        setChosen(null);
        if (await run(() => api.promoToShopping(promo.id)))
            toast(`Dodano do zakupów: ${promo.name}`);
    };
    if (promos === null || status === null)
        return _jsx("p", { className: "muted center", children: "\u0141adowanie\u2026" });
    const stores = [...new Set(promos.map((p) => p.store))];
    const categories = CATEGORIES.filter(([key]) => promos.some((p) => p.category === key));
    const term = fold(q.trim());
    const visible = promos.filter((p) => !hidden.has(p.store) && !hiddenCats.has(p.category) && (!term || fold(`${p.name} ${p.ingredient}`).includes(term)));
    const toggle = (set, key) => {
        const next = new Set(set);
        if (next.has(key))
            next.delete(key);
        else
            next.add(key);
        return next;
    };
    const failed = status.leaflets.filter((l) => l.status === "failed");
    return (_jsxs(_Fragment, { children: [_jsx("header", { className: "topbar", children: _jsx("h1", { children: "Promocje" }) }), _jsxs("p", { className: "muted small", children: [[status.stores.join(", "), checkedLabel(status)].filter(Boolean).join(" · "), aiEnabled && status.stores.length > 0 && !status.running && (_jsxs(_Fragment, { children: [" · ", _jsx("button", { type: "button", className: "link small", onClick: refresh, children: "\u21BB Sprawd\u017A teraz" })] }))] }), !aiEnabled && _jsx("p", { className: "error small", children: "Promocje z gazetek wymagaj\u0105 klucza do AI (opcje dodatku)." }), status.errors.map((e) => (_jsx("p", { className: "error small", children: e }, e))), promos.length === 0 ? (_jsx("p", { className: "muted center", children: status.running
                    ? "AI czyta nowe gazetki – to potrwa kilka minut."
                    : "Nie ma jeszcze promocji. Aplikacja sprawdza gazetki co 12 godzin – możesz też stuknąć „Sprawdź teraz”." })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "search-field", children: _jsx("input", { type: "search", value: q, onChange: (e) => setQ(e.target.value), placeholder: "Szukaj, np. mas\u0142o, kurczak\u2026" }) }), (stores.length > 1 || categories.length > 1) && (_jsxs("div", { className: "chips", children: [stores.length > 1 &&
                                stores.map((store) => (_jsx("button", { type: "button", className: `chip ${hidden.has(store) ? "" : "selected"}`, onClick: () => setHidden(toggle(hidden, store)), children: store }, store))), categories.length > 1 &&
                                categories.map(([key, name]) => (_jsx("button", { type: "button", className: `chip ${hiddenCats.has(key) ? "" : "selected"}`, onClick: () => setHiddenCats(toggle(hiddenCats, key)), children: name }, key)))] })), _jsxs("p", { className: "small", children: ["\uD83E\uDD55 Przepisy z tych produkt\u00F3w znajdziesz w ", _jsx(Link, { to: "/co-ugotowac", children: "Co ugotuj\u0119?" })] }), stores
                        .filter((store) => !hidden.has(store))
                        .map((store) => {
                        const items = visible.filter((p) => p.store === store);
                        if (!items.length)
                            return null;
                        return (_jsxs("section", { className: "promo-store", children: [_jsx("h2", { children: store }), _jsx("ul", { className: "promo-list", children: items.map((p) => (_jsx("li", { children: _jsxs("button", { type: "button", className: "promo-row", onClick: () => setChosen(p), children: [_jsxs("span", { className: "grow", children: [p.name, (p.note || p.valid_to || p.valid_from) && (_jsx("span", { className: "muted small promo-meta", children: [p.note, validLabel(p.valid_from, p.valid_to)].filter(Boolean).join(" · ") }))] }), _jsx("strong", { className: "promo-price", children: p.price })] }) }, p.id))) })] }, store));
                    }), visible.length === 0 && _jsx("p", { className: "muted center", children: "Nic nie pasuje do wyszukiwania." })] })), failed.length > 0 && (_jsxs("details", { className: "small muted", children: [_jsxs("summary", { children: ["Nieodczytane gazetki (", failed.length, ")"] }), _jsx("ul", { children: failed.map((l) => (_jsxs("li", { children: [l.store, ": ", l.title, " \u2013 ", l.error] }, l.url))) })] })), chosen && (_jsxs(Sheet, { title: chosen.name, onClose: () => setChosen(null), list: true, children: [_jsxs("p", { className: "small", children: [_jsx("strong", { children: chosen.price }), " \u00B7 ", chosen.store, chosen.note && ` · ${chosen.note}`, validLabel(chosen.valid_from, chosen.valid_to) && ` · ${validLabel(chosen.valid_from, chosen.valid_to)}`] }), _jsxs("p", { className: "muted small", children: ["Gazetka: ", chosen.leaflet] }), _jsx("button", { type: "button", className: "sheet-row", onClick: () => addToShopping(chosen), children: "\uD83D\uDED2 Dodaj do listy zakup\u00F3w" })] }))] }));
}
