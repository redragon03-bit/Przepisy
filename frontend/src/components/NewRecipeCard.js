import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, formatMinutes } from "../api";
import { nutritionText } from "../lib/nutrition";
// Przepis wymyślony przez AI (czat, pomysły z promocji): podgląd i zapis jednym przyciskiem.
export default function NewRecipeCard({ recipe }) {
    const [savedId, setSavedId] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const save = async () => {
        setSaving(true);
        setError("");
        try {
            setSavedId((await api.saveChatRecipe(recipe)).id);
        }
        catch (e) {
            setError(e.message);
        }
        finally {
            setSaving(false);
        }
    };
    const meta = [recipe.servings, formatMinutes(recipe.total_minutes), nutritionText(recipe)].filter(Boolean);
    return (_jsxs("div", { className: "box new-recipe", children: [_jsx("strong", { children: recipe.title }), recipe.description && _jsx("p", { className: "small", children: recipe.description }), meta.length > 0 && _jsx("p", { className: "muted small", children: meta.join(" · ") }), _jsxs("details", { children: [_jsx("summary", { children: "Sk\u0142adniki i przygotowanie" }), _jsx("ul", { children: recipe.ingredients.map((ing, i) => (_jsx("li", { children: ing.text }, i))) }), _jsx("ol", { children: recipe.steps.map((step, i) => (_jsx("li", { children: step.text }, i))) })] }), savedId ? (_jsx(Link, { to: `/przepis/${savedId}`, className: "button wide", children: "\u2705 Zapisany - otw\u00F3rz przepis" })) : (_jsx("button", { type: "button", className: "primary wide", disabled: saving, onClick: save, children: saving ? "Zapisuję…" : "💾 Zapisz przepis" })), error && _jsx("p", { className: "error small", children: error })] }));
}
