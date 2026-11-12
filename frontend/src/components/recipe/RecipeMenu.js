import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatMinutes } from "../../api";
import { hideRecipe, unhideRecipe } from "../../lib/hidden";
import { forgetRecipe } from "../../lib/recipeCache";
import { scaleStep, scaleText } from "../../lib/scale";
import { recipeAsText, shareText } from "../../lib/share";
import { shareAsImage } from "../../lib/shareImage";
import { shoppingMessage } from "../../lib/shopping";
import { useToast } from "../../lib/toast";
import PlanDaySheet from "../PlanDaySheet";
import Sheet, { SheetTile } from "../Sheet";
import VariantSheet from "./VariantSheet";
// Menu "⋯" na ekranie przepisu: rzadziej używane akcje w jednym panelu zamiast rzędu przycisków.
export default function RecipeMenu({ recipe, scale, servings, onChange, onSearchImages, aiEnabled }) {
    const [panel, setPanel] = useState(null);
    const photoInput = useRef(null);
    const navigate = useNavigate();
    const { toast, undoable, run } = useToast();
    const close = () => setPanel(null);
    const toShopping = async () => {
        close();
        const result = await run(() => api.addRecipeToShopping(recipe.id, scale));
        if (result)
            toast(shoppingMessage(result));
    };
    // Składniki i kroki po przeliczeniu porcji
    const scaled = {
        ingredients: recipe.ingredients.map((i) => scaleText(i.text, i.amount, scale)),
        steps: recipe.steps.map((s) => scaleStep(s.text, scale)),
    };
    const share = async () => {
        close();
        const result = await shareText(recipe.title, recipeAsText({ ...recipe, ...scaled, servings }));
        if (result)
            toast(result);
    };
    const shareImage = async () => {
        close();
        const meta = [servings, formatMinutes(recipe.total_minutes)].filter(Boolean).join(" · ");
        const result = await run(() => shareAsImage({ title: recipe.title, meta, ...scaled, imageUrl: recipe.image_url }));
        if (result)
            toast(result);
    };
    const nutrition = async () => {
        close();
        toast("Liczę kalorie…");
        const saved = await run(() => api.calculateNutrition(recipe.id));
        if (saved) {
            onChange(saved);
            toast("Kalorie policzone.");
        }
    };
    const changePhoto = async (file) => {
        if (!file)
            return;
        const saved = await run(() => api.uploadRecipeImage(recipe.id, file));
        if (saved)
            onChange(saved);
    };
    // Usunięcie z "Cofnij": przepis znika od razu, a serwer usuwa go po kilku sekundach
    const remove = () => {
        close();
        hideRecipe(recipe.id);
        navigate("/", { replace: true });
        undoable(`Usunięto „${recipe.title}”`, async () => {
            await api.deleteRecipe(recipe.id);
            forgetRecipe(recipe.id);
            unhideRecipe(recipe.id);
        }, () => {
            unhideRecipe(recipe.id);
            navigate(`/przepis/${recipe.id}`);
        });
    };
    return (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "link more-button", onClick: () => setPanel("menu"), "aria-label": "Wi\u0119cej akcji", children: "\u22EF" }), _jsx("input", { ref: photoInput, type: "file", accept: "image/*", hidden: true, onChange: (e) => changePhoto(e.target.files?.[0]) }), panel === "menu" && (_jsxs(Sheet, { onClose: close, children: [recipe.can_edit && _jsx(SheetTile, { icon: "\u270F\uFE0F", label: "Edytuj", onClick: () => navigate(`/przepis/${recipe.id}/edytuj`) }), _jsx(SheetTile, { icon: "\uD83D\uDCC5", label: "Zaplanuj", onClick: () => setPanel("plan") }), _jsx(SheetTile, { icon: "\uD83D\uDED2", label: "Do zakup\u00F3w", onClick: toShopping }), _jsx(SheetTile, { icon: "\uD83D\uDCE4", label: "Udost\u0119pnij", onClick: () => setPanel("share") }), aiEnabled && _jsx(SheetTile, { icon: "\uD83D\uDD00", label: "Wariant", onClick: () => setPanel("variant") }), recipe.can_edit && (_jsxs(_Fragment, { children: [_jsx(SheetTile, { icon: "\uD83D\uDDBC\uFE0F", label: "Zdj\u0119cie", onClick: () => setPanel("photo") }), _jsx(SheetTile, { icon: "\uD83D\uDD25", label: recipe.kcal == null ? "Kalorie" : "Kalorie od nowa", onClick: nutrition }), _jsx(SheetTile, { icon: "\uD83D\uDDD1\uFE0F", label: "Usu\u0144", onClick: remove, danger: true })] }))] })), panel === "plan" && _jsx(PlanDaySheet, { recipeId: recipe.id, onClose: close }), panel === "variant" && _jsx(VariantSheet, { recipe: recipe, onClose: close }), panel === "share" && (_jsxs(Sheet, { title: "Udost\u0119pnij przepis", onClose: close, list: true, children: [_jsx("button", { type: "button", className: "sheet-row", onClick: shareImage, children: "\uD83D\uDDBC\uFE0F Jako obrazek (ze zdj\u0119ciem)" }), _jsx("button", { type: "button", className: "sheet-row", onClick: share, children: "\uD83D\uDCDD Jako tekst" })] })), panel === "photo" && (_jsxs(Sheet, { title: "Zdj\u0119cie przepisu", onClose: close, list: true, children: [_jsx("button", { type: "button", className: "sheet-row", onClick: () => {
                            close();
                            photoInput.current?.click();
                        }, children: "\uD83D\uDCF7 Z telefonu (aparat albo galeria)" }), _jsx("button", { type: "button", className: "sheet-row", onClick: () => {
                            close();
                            onSearchImages();
                        }, children: "\uD83D\uDD0D Znajd\u017A w internecie" })] }))] }));
}
