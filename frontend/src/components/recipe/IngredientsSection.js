import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useCheckedSet } from "../../lib/progress";
import { promoLabel } from "../../lib/promo";
import { usePantry } from "../../lib/usePantry";
import { usePromoBadges } from "../../lib/promoBadges";
import { usePromotions } from "../../lib/usePromotions";
import { formatAmount, scaleText } from "../../lib/scale";
import { useLongPress } from "../../lib/useLongPress";
import SubstituteSheet from "./SubstituteSheet";
// Składniki z odhaczaniem i przeliczaniem porcji ("4 porcje" -> 6 porcji, albo mnożnik 2×).
// Przytrzymanie składnika pyta AI, czym go zastąpić.
export default function IngredientsSection({ recipe, baseServings, servings, setServings, factor, setFactor, scale, aiEnabled }) {
    // Odhaczone składniki zostają po powrocie do aplikacji (patrz lib/progress.ts)
    const [checked, toggle] = useCheckedSet(`checked-ingredients-${recipe.id}`);
    const [showOriginal, setShowOriginal] = useState(false);
    const [substitute, setSubstitute] = useState(null);
    // Plakietka "🏷️ Lidl 2,49 zł" przy składnikach, które są teraz w promocji
    // (można je wyłączyć w Ustawieniach)
    const promos = usePromotions();
    const [showPromos] = usePromoBadges();
    // "brak" przy składnikach, których nie ma w spiżarni (tylko gdy spiżarnia jest uzupełniona)
    const pantry = usePantry();
    const hasOriginal = recipe.ingredients.some((i) => i.original_text && i.original_text !== i.text);
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "row servings", children: [_jsx("h2", { children: "Sk\u0142adniki" }), baseServings && servings ? (_jsxs("span", { className: "stepper", children: [_jsx("button", { type: "button", onClick: () => setServings(Math.max(1, servings - 1)), "aria-label": "Mniej porcji", children: "\u2212" }), servings, " ", servings === 1 ? "porcja" : servings < 5 ? "porcje" : "porcji", _jsx("button", { type: "button", onClick: () => setServings(servings + 1), "aria-label": "Wi\u0119cej porcji", children: "+" })] })) : (_jsx("span", { className: "stepper", children: [0.5, 1, 2, 3].map((f) => (_jsxs("button", { type: "button", className: factor === f ? "active" : "", onClick: () => setFactor(f), children: [formatAmount(f), "\u00D7"] }, f))) }))] }), _jsx("ul", { className: "checklist ingredients", children: recipe.ingredients.map((ing, i) => (_jsx(IngredientRow, { text: scaleText(ing.text, ing.amount, scale), original: showOriginal && ing.original_text && ing.original_text !== ing.text ? ing.original_text : "", promo: showPromos ? promoLabel(ing.name, promos) : "", missing: pantry.known && !pantry.has(ing.name), done: checked.has(i), onToggle: () => toggle(i), onLongPress: aiEnabled ? () => setSubstitute(ing.text) : undefined }, i))) }), aiEnabled && recipe.ingredients.length > 0 && _jsx("p", { className: "muted small hint", children: "Brakuje czego\u015B? Przytrzymaj sk\u0142adnik." }), substitute && _jsx(SubstituteSheet, { recipeId: recipe.id, ingredient: substitute, onClose: () => setSubstitute(null) }), hasOriginal && (_jsx("button", { type: "button", className: "link small", onClick: () => setShowOriginal(!showOriginal), children: showOriginal ? "Ukryj oryginalne miary" : "Pokaż oryginalne miary" }))] }));
}
function IngredientRow({ text, original, promo, missing, done, onToggle, onLongPress }) {
    const { wasLongPress, ...longPress } = useLongPress(() => onLongPress?.());
    return (_jsxs("li", { className: [done && "done", missing && !done && "missing"].filter(Boolean).join(" "), role: "checkbox", "aria-checked": done, tabIndex: 0, ...(onLongPress ? longPress : {}), onClick: () => !wasLongPress() && onToggle(), children: [_jsx("span", { className: "check", "aria-hidden": "true" }), _jsxs("span", { children: [_jsx("span", { className: "item-text", children: text }), original && _jsxs("span", { className: "muted small", children: [" (", original, ")"] }), missing && !done && _jsx("span", { className: "tag tag-missing", children: "brak" }), promo && _jsxs("span", { className: "tag tag-promo", children: ["\uD83C\uDFF7\uFE0F ", promo] })] })] }));
}
