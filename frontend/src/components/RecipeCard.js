import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatMinutes } from "../api";
import { shoppingMessage } from "../lib/shopping";
import { useToast } from "../lib/toast";
import { useLongPress } from "../lib/useLongPress";
import PlanDaySheet from "./PlanDaySheet";
import Sheet, { SheetTile } from "./Sheet";
// Karta przepisu na liście. Przytrzymanie palcem otwiera szybkie menu
// (ulubione, plan, zakupy) bez wchodzenia w przepis.
export default function RecipeCard({ recipe, children }) {
    const [menu, setMenu] = useState(null);
    const [favorite, setFavorite] = useState(recipe.favorite);
    const { toast, run } = useToast();
    const { wasLongPress, ...longPress } = useLongPress(() => setMenu("menu"));
    useEffect(() => setFavorite(recipe.favorite), [recipe.favorite]);
    const toggleFavorite = async () => {
        setMenu(null);
        const saved = await run(() => api.patchRecipe(recipe.id, { favorite: !favorite }));
        if (saved)
            setFavorite(saved.favorite);
    };
    const toShopping = async () => {
        setMenu(null);
        const result = await run(() => api.addRecipeToShopping(recipe.id));
        if (result)
            toast(shoppingMessage(result));
    };
    return (_jsxs(_Fragment, { children: [_jsxs(Link, { to: `/przepis/${recipe.id}`, className: "card", ...longPress, onClick: (e) => {
                    if (wasLongPress())
                        e.preventDefault(); // puszczenie palca po przytrzymaniu nie otwiera przepisu
                }, children: [recipe.thumb_url ? (_jsx("img", { src: recipe.thumb_url, alt: "", loading: "lazy" })) : (_jsx("div", { className: "card-placeholder", children: "\uD83C\uDF7D\uFE0F" })), _jsxs("div", { className: "card-body", children: [_jsxs("strong", { children: [favorite && "❤️ ", recipe.title] }), recipe.rating ? _jsx("span", { className: "stars small", children: "★".repeat(recipe.rating) }) : null, recipe.total_minutes ? _jsxs("span", { className: "muted", children: ["\u23F1 ", formatMinutes(recipe.total_minutes)] }) : null, children] })] }), menu === "menu" && (_jsxs(Sheet, { title: recipe.title, onClose: () => setMenu(null), children: [_jsx(SheetTile, { icon: favorite ? "🤍" : "❤️", label: favorite ? "Usuń z ulubionych" : "Do ulubionych", onClick: toggleFavorite }), _jsx(SheetTile, { icon: "\uD83D\uDCC5", label: "Zaplanuj", onClick: () => setMenu("plan") }), _jsx(SheetTile, { icon: "\uD83D\uDED2", label: "Do zakup\u00F3w", onClick: toShopping })] })), menu === "plan" && _jsx(PlanDaySheet, { recipeId: recipe.id, onClose: () => setMenu(null) })] }));
}
