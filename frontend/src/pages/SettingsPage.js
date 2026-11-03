import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useToast } from "../lib/toast";
const AI_NAMES = { anthropic: "Claude", gemini: "Gemini", groq: "Groq", mistral: "Mistral" };
export default function SettingsPage({ auth, onLogout }) {
    const [staples, setStaples] = useState([]);
    const [newStaple, setNewStaple] = useState("");
    const [backups, setBackups] = useState([]);
    const [uncategorized, setUncategorized] = useState(0);
    const [images, setImages] = useState(null);
    const [working, setWorking] = useState("");
    const [duplicates, setDuplicates] = useState(null);
    const restoreInput = useRef(null);
    const { toast, run } = useToast();
    const refresh = () => api.listIngredients("", true).then(setStaples);
    useEffect(() => {
        refresh();
        api.listBackups().then(setBackups);
        if (auth.ai_enabled) {
            api.recipeStats().then((s) => setUncategorized(s.uncategorized));
            api.imageSearchStatus().then(setImages);
        }
    }, [auth.ai_enabled]);
    const autoCategorize = async () => {
        setWorking("categories");
        const result = await run(() => api.autoCategorize());
        setWorking("");
        if (result) {
            setUncategorized(result.remaining);
            toast(result.remaining ? `Przypisano ${result.updated}, zostało ${result.remaining} - stuknij jeszcze raz.` : "Gotowe!");
        }
    };
    // Adres z tokenem - kalendarz pobiera go sam, bez logowania. `app` = adres do linków w wydarzeniach.
    const copyCalendar = async () => {
        const link = await run(() => api.calendarLink());
        if (!link)
            return;
        const url = `${location.origin}${link.path}&app=${encodeURIComponent(location.origin)}`;
        try {
            await navigator.clipboard.writeText(url);
            toast("Skopiowano adres kalendarza.");
        }
        catch {
            window.prompt("Adres kalendarza:", url);
        }
    };
    const findDuplicates = async () => {
        setWorking("duplicates");
        const found = await run(() => api.findDuplicateIngredients());
        setWorking("");
        if (found) {
            setDuplicates(found);
            if (!found.length)
                toast("Nie znalazłem podwójnych składników.");
        }
    };
    const merge = async (group) => {
        // run() zwraca undefined także po błędzie, więc odpowiedź bez treści zamieniamy na true
        if (await run(() => api.mergeIngredients(group.keep, group.others).then(() => true))) {
            setDuplicates((list) => list && list.filter((g) => g !== group));
            toast(`Połączono w „${group.keep}”.`);
        }
    };
    const findImages = async () => {
        const status = await run(() => api.startImageSearch());
        if (status) {
            setImages(status);
            toast("Szukam zdjęć w tle - postęp widać na liście przepisów.");
        }
    };
    // Przywrócenie kopii to duża zmiana, więc tu (wyjątkowo) pytamy. Obecne dane i tak
    // trafiają najpierw do kopii automatycznych - można do nich wrócić.
    const restore = async (file) => {
        if (restoreInput.current)
            restoreInput.current.value = "";
        if (!file || !window.confirm(`Zastąpić wszystkie przepisy zawartością pliku „${file.name}”? Obecne dane zostaną zapisane jako kopia automatyczna.`))
            return;
        setWorking("restore");
        const result = await run(() => api.restoreBackup(file));
        setWorking("");
        if (result) {
            toast(`Przywrócono kopię: ${result.recipes} przepisów.`);
            api.listBackups().then(setBackups);
            refresh();
        }
    };
    const add = async (e) => {
        e.preventDefault();
        if (!newStaple.trim())
            return;
        if (!(await run(() => api.addStaple(newStaple))))
            return;
        setNewStaple("");
        refresh();
    };
    const logout = async () => {
        await api.logout();
        onLogout();
    };
    return (_jsxs(_Fragment, { children: [_jsx("header", { className: "topbar", children: _jsx("h1", { children: "Ustawienia" }) }), !auth.auth_required && (_jsx("p", { className: "box warning small", children: "Aplikacja nie ma has\u0142a - ka\u017Cdy, kto ma do niej dost\u0119p, mo\u017Ce zmienia\u0107 przepisy. Ustaw has\u0142o w opcjach dodatku (app_password)." })), _jsxs("section", { className: "box", children: [_jsx("h2", { children: "Zawsze w domu" }), _jsx("p", { className: "muted small", children: "Te sk\u0142adniki nie s\u0105 liczone jako brakuj\u0105ce w \u201ECo ugotuj\u0119?\u201D." }), _jsx("div", { className: "chips", children: staples.map((s) => (_jsxs("button", { type: "button", className: "chip", onClick: () => run(() => api.setStaple(s.id, false)).then(refresh), children: [s.name, " \u2715"] }, s.id))) }), _jsxs("form", { className: "row", onSubmit: add, children: [_jsx("input", { value: newStaple, onChange: (e) => setNewStaple(e.target.value), placeholder: "np. mas\u0142o", autoCapitalize: "none" }), _jsx("button", { children: "Dodaj" })] })] }), _jsxs("section", { className: "box", children: [_jsx("h2", { children: "Kopia zapasowa" }), _jsx("p", { className: "muted small", children: "Plik ZIP z baz\u0105 przepis\u00F3w i wszystkimi zdj\u0119ciami." }), _jsx("a", { className: "button wide", href: "/api/backup", download: true, children: "Pobierz kopi\u0119" }), _jsxs("p", { className: "muted small", children: ["Przeprowadzka do innej aplikacji (Mealie, Tandoor, Paprika):", " ", _jsx("a", { href: "/api/backup/schema-org", download: true, children: "przepisy w formacie schema.org" })] }), _jsx("p", { className: "muted small", children: "Aplikacja sama robi kopi\u0119 raz w tygodniu i trzyma 3 ostatnie (w folderze danych aplikacji)." }), _jsx("button", { type: "button", className: "wide", disabled: working === "restore", onClick: () => restoreInput.current?.click(), children: working === "restore" ? "Przywracam…" : "Przywróć z pliku…" }), _jsx("input", { ref: restoreInput, type: "file", accept: ".zip,application/zip", hidden: true, onChange: (e) => restore(e.target.files?.[0]) }), backups.length === 0 ? (_jsx("p", { className: "muted small", children: "Pierwsza automatyczna kopia powstanie kilka minut po uruchomieniu." })) : (_jsx("ul", { className: "small", children: backups.map((b) => (_jsxs("li", { children: [_jsx("a", { href: `/api/backups/${b.name}`, download: true, children: new Date(b.created_at).toLocaleString("pl-PL", { dateStyle: "medium", timeStyle: "short" }) }), " ", _jsxs("span", { className: "muted", children: ["(", (b.size / 1024 / 1024).toFixed(1), " MB)"] })] }, b.name))) }))] }), _jsxs("section", { className: "box", children: [_jsx("h2", { children: "Porz\u0105dki" }), auth.ai_enabled && (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "wide", disabled: working === "categories" || !uncategorized, onClick: autoCategorize, children: working === "categories" ? "AI przypisuje kategorie…" : `✨ Przypisz kategorie (${uncategorized} bez kategorii)` }), _jsx("button", { type: "button", className: "wide", disabled: !images || images.running || !images.missing, onClick: findImages, children: images?.running ? `🔍 Szukam zdjęć… ${images.done}/${images.total}` : `🔍 Znajdź zdjęcia w internecie (${images?.missing ?? 0} bez zdjęcia)` })] })), _jsx("button", { type: "button", className: "wide", disabled: working === "duplicates", onClick: findDuplicates, children: working === "duplicates" ? "Szukam…" : "🧹 Znajdź podwójne składniki" }), duplicates && duplicates.length > 0 && (_jsxs(_Fragment, { children: [_jsx("p", { className: "muted small", children: "Ten sam produkt zapisany inaczej psuje wyszukiwanie i \u201ECo ugotuj\u0119?\u201D. Stuknij, \u017Ceby po\u0142\u0105czy\u0107." }), duplicates.map((g) => (_jsxs("button", { type: "button", className: "sheet-row", onClick: () => merge(g), children: [g.others.join(", "), " \u2192 ", _jsx("b", { children: g.keep }), " ", _jsxs("span", { className: "muted small", children: ["(", g.recipe_count, " przepis\u00F3w)"] })] }, g.keep)))] }))] }), _jsxs("section", { className: "box small", children: [_jsx("h2", { children: "Informacje" }), _jsxs("p", { children: ["AI (pytane po kolei):", " ", auth.ai_providers.length ? auth.ai_providers.map((p) => AI_NAMES[p] ?? p).join(" → ") + " ✅" : "wyłączone (brak klucza API)"] }), _jsxs("p", { children: ["Home Assistant: ", auth.ha_enabled ? "wysyłanie listy zakupów działa ✅" : "nie skonfigurowane"] }), _jsxs("p", { children: ["Powiadomienia z minutnik\u00F3w: ", auth.notify_enabled ? "przez Home Assistant ✅" : "wyłączone (opcja ha_notify dodatku)"] }), _jsxs("p", { children: ["Po\u0142\u0105czenie: ", window.isSecureContext ? "https ✅" : "http – bez pracy offline i bez utrzymywania włączonego ekranu (patrz README, HTTPS)"] }), _jsxs("p", { children: ["Plan posi\u0142k\u00F3w jako kalendarz (HA, Google, iPhone):", " ", _jsx("button", { type: "button", className: "link", onClick: copyCalendar, children: "kopiuj adres" })] }), _jsx("p", { className: "muted", children: "Na iPhonie: w Safari stuknij \u201EUdost\u0119pnij\u201D \u2192 \u201EDo ekranu pocz\u0105tkowego\u201D, \u017Ceby mie\u0107 aplikacj\u0119 jako ikon\u0119." })] }), auth.auth_required && (_jsx("button", { type: "button", className: "danger wide", onClick: logout, children: "Wyloguj" }))] }));
}
