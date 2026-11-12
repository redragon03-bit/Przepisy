import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { api } from "../../api";
import { useToast } from "../../lib/toast";
import Sheet from "../Sheet";
import Stars from "../Stars";
// Dziennik gotowania: kiedy, jak wyszło, notatki i zdjęcia. Najnowsze na górze.
export default function CookLogSheet({ recipe, onChange, onClose }) {
    const { undoable } = useToast();
    // Usunięcie z "Cofnij" - np. "Ugotowane" wciśnięte przez pomyłkę
    const remove = (entryId) => {
        const before = recipe;
        onChange({ ...recipe, cook_log: recipe.cook_log.filter((e) => e.id !== entryId) });
        undoable("Usunięto wpis z dziennika", async () => onChange(await api.deleteCooked(recipe.id, entryId)), () => onChange(before));
    };
    return (_jsxs(Sheet, { title: "Dziennik gotowania", onClose: onClose, list: true, children: [recipe.cook_log.length === 0 && _jsx("p", { className: "muted", children: "Wcze\u015Bniejsze gotowania nie maj\u0105 wpis\u00F3w w dzienniku." }), _jsx("ul", { className: "cook-log", children: recipe.cook_log.map((entry) => (_jsxs("li", { children: [_jsxs("div", { className: "row", children: [_jsx("strong", { children: new Date(entry.cooked_at).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" }) }), entry.rating && _jsx(Stars, { value: entry.rating }), _jsx("span", { className: "grow" }), _jsx("button", { type: "button", className: "link muted", "aria-label": "Usu\u0144 wpis", onClick: () => remove(entry.id), children: "\u2715" })] }), entry.note && _jsx("p", { children: entry.note }), entry.image_url && _jsx("img", { src: entry.image_url, alt: "", loading: "lazy" })] }, entry.id))) })] }));
}
