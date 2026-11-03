import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api";
import { cacheRecipe } from "../../lib/recipeCache";
import { useToast } from "../../lib/toast";
import Sheet from "../Sheet";
const IDEAS = ["wersja wege", "na 2 osoby", "bez glutenu", "bez laktozy", "lżejsza wersja", "pikantniej"];
// Wariant przepisu od AI ("wersja wege", "na 8 osób") - zapisany przy przepisie, nie jako osobny na liście.
export default function VariantSheet({ recipe, onClose }) {
    const [wish, setWish] = useState("");
    const [busy, setBusy] = useState(false);
    const navigate = useNavigate();
    const { run, toast } = useToast();
    const create = async (text) => {
        if (!text.trim())
            return;
        setBusy(true);
        const variant = await run(() => api.createVariant(recipe.id, text.trim()));
        setBusy(false);
        if (variant) {
            cacheRecipe(variant);
            onClose();
            toast(`Zapisano wariant „${variant.variant_name}”`);
            navigate(`/przepis/${variant.id}`);
        }
    };
    const submit = (e) => {
        e.preventDefault();
        create(wish);
    };
    return (_jsx(Sheet, { title: "Nowy wariant przepisu", onClose: onClose, list: true, children: busy ? (_jsx("p", { className: "muted", children: "AI przerabia przepis\u2026 (do minuty)" })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "chips", children: IDEAS.map((idea) => (_jsx("button", { type: "button", className: "chip", onClick: () => create(idea), children: idea }, idea))) }), _jsxs("form", { className: "row", onSubmit: submit, children: [_jsx("input", { value: wish, onChange: (e) => setWish(e.target.value), placeholder: "albo opisz w\u0142asny, np. \u201Ez indykiem\u201D", enterKeyHint: "go" }), _jsx("button", { type: "submit", className: "primary", disabled: !wish.trim(), children: "Zr\u00F3b" })] })] })) }));
}
