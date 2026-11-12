import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, isoDay } from "../api";
import IngredientPicker from "../components/IngredientPicker";
import PromoIdeasSheet from "../components/PromoIdeasSheet";
import RecipeCard from "../components/RecipeCard";
import Sheet from "../components/Sheet";
import { dayLabel } from "../lib/days";
import { useRemembered } from "../lib/remember";
import { usePromotions } from "../lib/usePromotions";
import { useToast } from "../lib/toast";
// Termin "do zużycia najpierw" (tak samo jak USE_FIRST_DAYS na serwerze)
const USE_FIRST_DAYS = 3;
function inDays(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return isoDay(date);
}
// "dziś", "jutro", "za 3 dni", "po terminie"
function expiresLabel(expires) {
    const days = Math.round((new Date(`${expires}T12:00`).getTime() - new Date(`${isoDay(new Date())}T12:00`).getTime()) / 86_400_000);
    if (days < 0)
        return "po terminie";
    if (days === 0)
        return "dziś";
    if (days === 1)
        return "jutro";
    return `za ${days} dni`;
}
// "Co mogę ugotować?" - wybierasz składniki, które masz, i dostajesz pasujące przepisy.
// Wybrane składniki to spiżarnia zapisana na serwerze: lista zakupów je pomija,
// a czat bierze je pod uwagę.
// Starsze wersje trzymały wybór w przeglądarce - przenosimy go raz do spiżarni.
const OLD_STORAGE_KEY = "cook-ingredients";
function takeOldSelection() {
    try {
        const old = JSON.parse(localStorage.getItem(OLD_STORAGE_KEY) ?? "[]");
        localStorage.removeItem(OLD_STORAGE_KEY);
        return Array.isArray(old) ? old : [];
    }
    catch {
        return [];
    }
}
// Tyle przepisów z promocjami pokazujemy od razu (reszta po "Pokaż wszystkie")
const PROMO_PREVIEW = 4;
// "Z promocji": Twoje przepisy ze składnikami w promocji i nowe pomysły od AI
function PromoSection({ aiEnabled }) {
    const promos = usePromotions();
    const [recipes, setRecipes] = useState(null);
    const [all, setAll] = useState(false);
    const [ideasOpen, setIdeasOpen] = useState(false);
    // Sklepy schowane w tej sekcji (stuknięcie w sklep go chowa/pokazuje) - zapamiętane w telefonie
    const [hiddenList, setHiddenList] = useRemembered("promo-cook-hidden-stores", []);
    const hidden = new Set(hiddenList);
    const setHidden = (next) => setHiddenList([...next]);
    useEffect(() => {
        api.promoRecipes().then(setRecipes, () => setRecipes([]));
    }, []);
    if (!promos.length || recipes === null)
        return null;
    const stores = [...new Set(promos.map((p) => p.store))];
    const toggleStore = (store) => {
        const next = new Set(hidden);
        if (next.has(store))
            next.delete(store);
        else
            next.add(store);
        setHidden(next);
    };
    // Tylko promocje z widocznych sklepów; przepis bez nich znika z sekcji
    const visible = recipes
        .map((m) => ({ ...m, promos: m.promos.filter((p) => !hidden.has(p.store)) }))
        .filter((m) => m.promos.length > 0);
    const shown = all ? visible : visible.slice(0, PROMO_PREVIEW);
    return (_jsxs("section", { className: "box", children: [_jsx("h2", { children: "\uD83C\uDFF7\uFE0F Z promocji" }), _jsxs("p", { className: "muted small", children: ["Twoje przepisy ze sk\u0142adnikami, kt\u00F3re s\u0105 teraz w promocji. Wszystkie produkty: ", _jsx(Link, { to: "/promocje", children: "Promocje" }), "."] }), stores.length > 1 && (_jsx("div", { className: "chips", children: stores.map((store) => (_jsx("button", { type: "button", className: `chip ${hidden.has(store) ? "" : "selected"}`, onClick: () => toggleStore(store), children: store }, store))) })), visible.length === 0 ? (_jsxs("p", { className: "muted small", children: ["\u017Baden z Twoich przepis\u00F3w nie ma teraz sk\u0142adnik\u00F3w w promocji", hidden.size ? " w wybranych sklepach" : "", "."] })) : (_jsx("div", { className: "grid", children: shown.map((m) => (_jsx(RecipeCard, { recipe: m.recipe, children: _jsxs("span", { className: "small promo-badge card-tag", children: ["\uD83C\uDFF7\uFE0F ", m.promos.map((p) => `${p.ingredient} (${p.label})`).join(", ")] }) }, m.recipe.id))) })), visible.length > PROMO_PREVIEW && (_jsx("button", { type: "button", className: "link small", onClick: () => setAll(!all), children: all ? "Pokaż mniej" : `Pokaż wszystkie (${visible.length})` })), aiEnabled && (_jsx("button", { type: "button", className: "wide", onClick: () => setIdeasOpen(true), children: "\u2728 Nowe pomys\u0142y z promocji" })), ideasOpen && _jsx(PromoIdeasSheet, { stores: stores, initial: hidden.size ? stores.filter((s) => !hidden.has(s)) : [], onClose: () => setIdeasOpen(false) })] }));
}
export default function CookPage({ aiEnabled }) {
    const [have, setHave] = useState(null);
    const [maxMissing, setMaxMissing] = useState(1);
    const [matches, setMatches] = useState(null);
    // Terminy zużycia produktów ze spiżarni: nazwa -> RRRR-MM-DD
    const [expires, setExpires] = useState({});
    const [editing, setEditing] = useState(null);
    const { run } = useToast();
    const applyItems = (items) => setExpires(Object.fromEntries(items.filter((i) => i.expires).map((i) => [i.name, i.expires])));
    useEffect(() => {
        api.getPantry().then((pantry) => {
            const old = takeOldSelection();
            if (!pantry.length && old.length)
                api.setPantry(old).then(setHave);
            else
                setHave(pantry);
        });
        api.pantryItems().then(applyItems);
    }, []);
    useEffect(() => {
        if (!have?.length) {
            setMatches(null);
            return;
        }
        api.whatCanICook(have, maxMissing).then(setMatches);
    }, [have, maxMissing, expires]);
    const change = async (names) => {
        setHave(names);
        setHave(await api.setPantry(names));
    };
    // Data wybierana w kalendarzu "Inna data" (zapisywana po jego zamknięciu)
    const [otherDay, setOtherDay] = useState("");
    useEffect(() => setOtherDay(editing ? (expires[editing] ?? "") : ""), [editing, expires]);
    const setTerm = async (name, day) => {
        setEditing(null);
        const items = await run(() => api.setPantryExpires(name, day));
        if (items)
            applyItems(items);
    };
    const remove = (name) => {
        setEditing(null);
        change(have.filter((n) => n !== name));
    };
    if (have === null)
        return _jsx("p", { className: "muted center", children: "\u0141adowanie\u2026" });
    const soon = inDays(USE_FIRST_DAYS);
    const urgent = have.filter((n) => expires[n] && expires[n] <= soon).sort((a, b) => expires[a].localeCompare(expires[b]));
    return (_jsxs(_Fragment, { children: [_jsx("header", { className: "topbar", children: _jsx("h1", { children: "Co ugotuj\u0119?" }) }), _jsxs("section", { className: "box", children: [_jsx("h2", { children: "Moja spi\u017Carnia" }), _jsx("p", { className: "muted small", children: "Wpisz, co masz w domu. Aplikacja to zapami\u0119ta: lista zakup\u00F3w pominie te produkty, a czat we\u017Amie je pod uwag\u0119. Stuknij produkt, \u017Ceby ustawi\u0107, do kiedy trzeba go zu\u017Cy\u0107. S\u00F3l, pieprz, olej itp. s\u0105 liczone jako \u201Ezawsze w domu\u201D (zmienisz to w Ustawieniach)." }), _jsx(IngredientPicker, { value: have, onChange: change, placeholder: "np. jajko, pomidor\u2026", onChipClick: setEditing, chipLabel: (name) => (expires[name] && expires[name] <= soon ? `⏰ ${name}` : name) }), urgent.length > 0 && (_jsxs("p", { className: "small use-first", children: ["\u23F0 Zu\u017Cyj najpierw: ", urgent.map((n) => `${n} (${expiresLabel(expires[n])})`).join(", ")] })), _jsxs("label", { className: "row small", children: ["Mo\u017Ce brakowa\u0107:", _jsxs("select", { value: maxMissing, onChange: (e) => setMaxMissing(Number(e.target.value)), children: [_jsx("option", { value: 0, children: "nic" }), _jsx("option", { value: 1, children: "1 sk\u0142adnika" }), _jsx("option", { value: 2, children: "2 sk\u0142adnik\u00F3w" }), _jsx("option", { value: 3, children: "3 sk\u0142adnik\u00F3w" })] })] })] }), _jsx(PromoSection, { aiEnabled: aiEnabled }), matches === null ? null : matches.length === 0 ? (_jsx("p", { className: "muted center", children: "Brak pasuj\u0105cych przepis\u00F3w. Spr\u00F3buj doda\u0107 sk\u0142adniki albo zwi\u0119kszy\u0107 liczb\u0119 brak\u00F3w." })) : (_jsx("div", { className: "grid", children: matches.map((m) => (_jsxs(RecipeCard, { recipe: m.recipe, children: [m.use_first.length > 0 && _jsxs("span", { className: "small use-first", children: ["\u23F0 zu\u017Cyje: ", m.use_first.join(", ")] }), m.missing.length === 0 ? (_jsx("span", { className: "ok small", children: "Masz wszystko!" })) : (_jsxs("span", { className: "small missing-line", children: ["Brakuje: ", m.missing.join(", ")] }))] }, m.recipe.id))) })), editing && (_jsxs(Sheet, { title: expires[editing] ? `${editing}: zużyć do ${dayLabel(expires[editing])}` : `${editing}: do kiedy zużyć?`, onClose: () => setEditing(null), list: true, children: [[
                        ["Dziś", 0],
                        ["Jutro", 1],
                        ["Za 3 dni", 3],
                        ["Za tydzień", 7],
                    ].map(([label, days]) => (_jsx("button", { type: "button", className: "sheet-row", onClick: () => setTerm(editing, inDays(days)), children: label }, label))), _jsxs("label", { className: "sheet-row", children: ["Inna data:", " ", _jsx("input", { type: "date", min: isoDay(new Date()), value: otherDay, 
                                // iPhone zmienia wartość już przy otwarciu kalendarza i przy każdym stuknięciu w dzień -
                                // zapisujemy dopiero po zamknięciu kalendarza (pole traci fokus), inaczej okno znika,
                                // zanim wybierzesz datę. Zmiana bez fokusu (np. inna przeglądarka) zapisuje się od razu.
                                onChange: (e) => {
                                    setOtherDay(e.target.value);
                                    if (e.target.value && document.activeElement !== e.target)
                                        setTerm(editing, e.target.value);
                                }, onBlur: () => otherDay && otherDay !== expires[editing] && setTerm(editing, otherDay) })] }), expires[editing] && (_jsx("button", { type: "button", className: "sheet-row", onClick: () => setTerm(editing, null), children: "Bez terminu" })), _jsx("button", { type: "button", className: "sheet-row danger-tile", onClick: () => remove(editing), children: "\uD83D\uDDD1\uFE0F Usu\u0144 ze spi\u017Carni" })] }))] }));
}
