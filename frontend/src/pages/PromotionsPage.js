import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import Sheet from "../components/Sheet";
import { validLabel } from "../lib/promo";
import { useRemembered } from "../lib/remember";
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
// Ikonka działu, gdy nie ma wycinka produktu z gazetki
const AISLE_ICONS = {
    Napoje: "🧃",
    "Przyprawy i sosy": "🧂",
    "Warzywa i owoce": "🍎",
    Pieczywo: "🥖",
    "Nabiał i jajka": "🧀",
    "Mięso i ryby": "🥩",
    Mrożonki: "🧊",
    "Sypkie i makarony": "🍝",
    "Puszki i słoiki": "🥫",
    "Słodycze i bakalie": "🍫",
    Tłuszcze: "🫒",
    "Chemia i dom": "🧽",
    "Dla dziecka": "👶",
};
// Ikonka konkretnej rzeczy, gdy da się ją poznać po nazwie (herbata to nie sok)
const ITEM_ICONS = [
    [/herbat|kaw[ay]\b|kawa|cappuccino/, "☕"],
    [/wod[ay]\b|woda/, "💧"],
    [/mlek|mleczn/, "🥛"],
    [/jaj/, "🥚"],
    [/ser\b|sery|serek|mozzarell|gouda|edam/, "🧀"],
    [/maslo|masla/, "🧈"],
    [/kurcz|indyk|drob|skrzyd|udk|udo/, "🍗"],
    [/ryb|losos|dorsz|sledz|makrel|tunczyk|krewet/, "🐟"],
    [/kielbas|parow|szynk|boczek|salami/, "🥓"],
    [/chleb|bulk|bagiet|rogal|pieczyw/, "🍞"],
    [/ziemniak/, "🥔"],
    [/pomidor/, "🍅"],
    [/marchew/, "🥕"],
    [/cebul|czosn/, "🧅"],
    [/ogor/, "🥒"],
    [/jablk/, "🍏"],
    [/banan/, "🍌"],
    [/pomarancz|mandaryn/, "🍊"],
    [/cytryn/, "🍋"],
    [/winogron/, "🍇"],
    [/truskaw/, "🍓"],
    [/ananas/, "🍍"],
    [/awokado/, "🥑"],
    [/makaron|spaghetti|penne/, "🍝"],
    [/ryz\b|ryz /, "🍚"],
    [/czekolad|baton|cukierk|praling/, "🍫"],
    [/ciast|ciastk|babk|piernik/, "🍰"],
    [/lody/, "🍦"],
    [/sok/, "🧃"],
    [/pieluch|chusteczk/, "👶"],
];
function itemIcon(p) {
    const text = fold(`${p.name} ${p.ingredient}`);
    return ITEM_ICONS.find(([re]) => re.test(text))?.[1] ?? AISLE_ICONS[p.aisle] ?? "🛒";
}
// Działy w kolejności jak w sklepie; w dziale największe rabaty na górze
function byAisle(items) {
    const sorted = [...items].sort((a, b) => a.aisle_order - b.aisle_order || b.discount - a.discount || a.name.localeCompare(b.name, "pl"));
    const groups = [];
    for (const p of sorted) {
        const last = groups[groups.length - 1];
        if (last && last[0] === p.aisle)
            last[1].push(p);
        else
            groups.push([p.aisle, [p]]);
    }
    return groups;
}
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
    const searchInput = useRef(null);
    // Sklepy i grupy ukryte na liście (stuknięcie chowa/pokazuje) - zapamiętane w telefonie
    const [hiddenList, setHiddenList] = useRemembered("promo-hidden-stores", []);
    const [hiddenCatList, setHiddenCatList] = useRemembered("promo-hidden-groups", []);
    // Tylko jeden dział, np. "Mięso i ryby" ("" = wszystkie)
    const [onlyAisle, setOnlyAisle] = useRemembered("promo-aisle", "");
    const hidden = new Set(hiddenList);
    const hiddenCats = new Set(hiddenCatList);
    const setHidden = (next) => setHiddenList([...next]);
    const setHiddenCats = (next) => setHiddenCatList([...next]);
    const [favorites, setFavorites] = useState([]);
    const [chosen, setChosen] = useState(null);
    const { toast, run } = useToast();
    const load = () => {
        api.listPromotions().then(setPromos, () => setPromos([]));
        api.promoStatus().then(setStatus, () => { });
        api.promoFavorites().then(setFavorites, () => { });
    };
    useEffect(load, []);
    const toggleFavorite = async (promo) => {
        const on = !favorites.includes(promo.key);
        const fresh = await run(() => api.setPromoFavorite(promo.key, on));
        if (!fresh)
            return;
        setFavorites(fresh);
        toast(on ? `⭐ Ulubione: ${promo.key} (każda marka)` : `Usunięto z ulubionych: ${promo.key}`);
        api.listPromotions().then(setPromos, () => { });
    };
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
    const shown = promos.filter((p) => !hidden.has(p.store) && !hiddenCats.has(p.category));
    const aisles = [...new Map(shown.map((p) => [p.aisle, p.aisle_order])).entries()].sort((a, b) => a[1] - b[1]).map(([name]) => name);
    const aisle = aisles.includes(onlyAisle) ? onlyAisle : "";
    const visible = shown.filter((p) => (!aisle || p.aisle === aisle) && (!term || fold(`${p.name} ${p.ingredient} ${p.aisle}`).includes(term)));
    const favoritesOn = visible.filter((p) => p.favorite).sort((a, b) => b.discount - a.discount);
    const row = (p, withStore = false) => (_jsx("li", { children: _jsxs("button", { type: "button", className: "promo-row", onClick: () => setChosen(p), children: [p.image_url ? (_jsx("img", { className: "promo-thumb", src: p.image_url, alt: "", loading: "lazy" })) : (_jsx("span", { className: "promo-thumb promo-icon", "aria-hidden": "true", children: itemIcon(p) })), _jsxs("span", { className: "grow", children: [p.favorite && "⭐ ", p.name, (withStore || p.note || p.valid_to || p.valid_from) && (_jsx("span", { className: "muted small promo-meta", children: [withStore && p.store, p.note, validLabel(p.valid_from, p.valid_to)].filter(Boolean).join(" · ") }))] }), _jsxs("span", { className: "promo-price", children: [_jsx("strong", { children: p.price }), p.discount > 0 && _jsxs("span", { className: "promo-discount", children: ["-", p.discount, "%"] })] })] }) }, p.id));
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
                    : "Nie ma jeszcze promocji. Aplikacja sprawdza gazetki co 12 godzin – możesz też stuknąć „Sprawdź teraz”." })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "search-field", children: [_jsx("input", { ref: searchInput, type: "search", enterKeyHint: "search", value: q, onChange: (e) => setQ(e.target.value), onKeyDown: (e) => e.key === "Enter" && e.currentTarget.blur(), placeholder: "Szukaj, np. mas\u0142o, kurczak\u2026" }), q && (_jsx("button", { type: "button", className: "search-clear", "aria-label": "Wyczy\u015B\u0107 wyszukiwanie", 
                                // Bez tego pole straciłoby fokus i klawiatura na iPhonie by się schowała
                                onMouseDown: (e) => e.preventDefault(), onClick: () => {
                                    setQ("");
                                    searchInput.current?.focus();
                                }, children: "\u00D7" }))] }), (stores.length > 1 || categories.length > 1) && (_jsxs("div", { className: "chips", children: [stores.length > 1 &&
                                stores.map((store) => (_jsx("button", { type: "button", className: `chip ${hidden.has(store) ? "" : "selected"}`, onClick: () => setHidden(toggle(hidden, store)), children: store }, store))), categories.length > 1 &&
                                categories.map(([key, name]) => (_jsx("button", { type: "button", className: `chip ${hiddenCats.has(key) ? "" : "selected"}`, onClick: () => setHiddenCats(toggle(hiddenCats, key)), children: name }, key)))] })), aisles.length > 1 && (_jsxs("select", { className: "promo-aisle-select", value: aisle, onChange: (e) => setOnlyAisle(e.target.value), "aria-label": "Dzia\u0142", children: [_jsx("option", { value: "", children: "Wszystkie dzia\u0142y" }), aisles.map((name) => (_jsxs("option", { value: name, children: [AISLE_ICONS[name] ?? "🛒", " ", name] }, name)))] })), _jsxs("p", { className: "small", children: ["\uD83E\uDD55 Przepisy z tych produkt\u00F3w znajdziesz w ", _jsx(Link, { to: "/co-ugotowac", children: "Co ugotuj\u0119?" })] }), favoritesOn.length > 0 && (_jsxs("section", { className: "promo-store", children: [_jsx("h2", { children: "\u2B50 Ulubione w promocji" }), _jsx("ul", { className: "promo-list", children: favoritesOn.map((p) => row(p, true)) })] })), stores
                        .filter((store) => !hidden.has(store))
                        .map((store) => {
                        const items = visible.filter((p) => p.store === store && !p.favorite);
                        if (!items.length)
                            return null;
                        return (_jsxs("section", { className: "promo-store", children: [_jsx("h2", { children: store }), byAisle(items).map(([name, group]) => (_jsxs("div", { children: [!aisle && _jsx("h3", { className: "promo-aisle muted small", children: name }), _jsx("ul", { className: "promo-list", children: group.map((p) => row(p)) })] }, name)))] }, store));
                    }), visible.length === 0 && _jsx("p", { className: "muted center", children: "Nic nie pasuje do filtr\u00F3w." })] })), failed.length > 0 && (_jsxs("details", { className: "small muted", children: [_jsxs("summary", { children: ["Nieodczytane gazetki (", failed.length, ")"] }), _jsx("ul", { children: failed.map((l) => (_jsxs("li", { children: [l.store, ": ", l.title, " \u2013 ", l.error] }, l.url))) })] })), chosen && (_jsxs(Sheet, { title: chosen.name, onClose: () => setChosen(null), list: true, children: [chosen.image_url && _jsx("img", { className: "promo-photo", src: chosen.image_url, alt: "" }), _jsxs("p", { className: "small", children: [_jsx("strong", { children: chosen.price }), chosen.discount > 0 && ` (-${chosen.discount}%)`, " \u00B7 ", chosen.store, chosen.note && ` · ${chosen.note}`, validLabel(chosen.valid_from, chosen.valid_to) && ` · ${validLabel(chosen.valid_from, chosen.valid_to)}`] }), _jsxs("p", { className: "muted small", children: ["Gazetka: ", chosen.leaflet] }), _jsx("button", { type: "button", className: "sheet-row", onClick: () => addToShopping(chosen), children: "\uD83D\uDED2 Dodaj do listy zakup\u00F3w" }), _jsx("button", { type: "button", className: "sheet-row", onClick: () => toggleFavorite(chosen).then(() => setChosen(null)), children: favorites.includes(chosen.key) ? `☆ Usuń z ulubionych (${chosen.key})` : `⭐ Ulubione: ${chosen.key} – pokazuj na górze, każda marka` })] }))] }));
}
