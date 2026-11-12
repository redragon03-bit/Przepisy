import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import CookedSheet from "../components/recipe/CookedSheet";
import { useGoBack } from "../lib/navigation";
import { useCheckedSet, useSavedState } from "../lib/progress";
import { cachedRecipe } from "../lib/recipeCache";
import { scaleStep, scaleText } from "../lib/scale";
import { canSpeak, readAloudPreference, saveReadAloudPreference, speak, stopSpeaking } from "../lib/speech";
import { stepIngredients } from "../lib/stepIngredients";
import { findDurations } from "../lib/timers";
import { useTimers, useWakeLock } from "../lib/useTimers";
// Tryb gotowania: jeden krok na ekranie, duża czcionka, ekran nie gaśnie.
// 🔊 czyta kroki na głos (ręce w cieście) - każdy kolejny krok czyta się sam.
// Adres: /przepis/12/gotuj?skala=1.5 (skala = przeliczenie porcji z ekranu przepisu).
export default function CookingModePage() {
    const id = Number(useParams().id);
    const [params] = useSearchParams();
    const scale = Number(params.get("skala")) || 1;
    const goBack = useGoBack(`/przepis/${id}`);
    const [recipe, setRecipe] = useState(() => cachedRecipe(id) ?? null);
    const [error, setError] = useState("");
    // -1 = najpierw lista składników; krok jest zapamiętany, gdy iPhone zamknie aplikację w tle
    const [step, setStep] = useSavedState(`cooking-step-${id}`, -1);
    const { start } = useTimers();
    const [readAloud, setReadAloud] = useState(readAloudPreference);
    const [finishing, setFinishing] = useState(false);
    // Bez https Safari nie pozwala trzymać włączonego ekranu - mówimy o tym, zamiast udawać, że działa
    const [screenMaySleep, setScreenMaySleep] = useState(() => !("wakeLock" in navigator));
    useWakeLock(true, () => setScreenMaySleep(true));
    const touchStart = useRef(null);
    // Te same odhaczone składniki co na ekranie przepisu
    const [checked, toggleChecked] = useCheckedSet(`checked-ingredients-${id}`);
    // Kierunek animacji kroku: do przodu wjeżdża z prawej, wstecz z lewej
    const [direction, setDirection] = useState(1);
    const go = (next) => {
        setDirection(next > step ? 1 : -1);
        setStep(next);
    };
    useEffect(() => {
        api
            .getRecipe(id)
            .then(setRecipe)
            .catch((e) => !cachedRecipe(id) && setError(e.message));
    }, [id]);
    // Nowy krok (albo włączenie czytania) - czytamy go na głos
    const text = recipe && step >= 0 ? scaleStep(recipe.steps[step]?.text ?? "", scale) : "";
    useEffect(() => {
        if (readAloud && text)
            speak(`Krok ${step + 1}. ${text}`);
    }, [readAloud, text, step]);
    useEffect(() => stopSpeaking, []);
    const toggleReadAloud = () => {
        const on = !readAloud;
        setReadAloud(on);
        saveReadAloudPreference(on);
        if (!on)
            stopSpeaking();
    };
    if (error)
        return _jsx("p", { className: "error center", children: error });
    if (!recipe)
        return _jsx("p", { className: "muted center", children: "\u0141adowanie\u2026" });
    const last = recipe.steps.length - 1;
    const current = step >= 0 ? recipe.steps[step] : null;
    // Składniki użyte w tym kroku - żeby nie wracać do listy
    const used = current ? stepIngredients(recipe.ingredients, [current.text])[0] : [];
    // Przesunięcie palcem w lewo = następny krok, w prawo = poprzedni
    const onTouchStart = (e) => {
        touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onTouchEnd = (e) => {
        const from = touchStart.current;
        touchStart.current = null;
        if (!from)
            return;
        const dx = e.changedTouches[0].clientX - from.x;
        const dy = e.changedTouches[0].clientY - from.y;
        if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5)
            return;
        if (dx < 0 && step < last)
            go(step + 1);
        if (dx > 0 && step >= 0)
            go(step - 1);
    };
    return (_jsxs("div", { className: "cooking", children: [_jsxs("header", { className: "topbar", children: [_jsx("button", { type: "button", className: "link", onClick: goBack, children: "\u2715 Zako\u0144cz" }), _jsx("span", { className: "muted small", children: current ? `Krok ${step + 1} z ${recipe.steps.length}` : "Składniki" }), canSpeak && (_jsx("button", { type: "button", className: `link read-aloud ${readAloud ? "on" : ""}`, onClick: toggleReadAloud, "aria-pressed": readAloud, "aria-label": "Czytaj kroki na g\u0142os", children: readAloud ? "🔊" : "🔈" }))] }), _jsx("div", { className: "cooking-progress", "aria-hidden": "true", children: recipe.steps.map((_, i) => (_jsx("span", { className: i <= step ? "on" : "" }, i))) }), _jsx("p", { className: "wake-chip muted", children: screenMaySleep ? `Ekran może gasnąć${window.isSecureContext ? "" : " – utrzyma go adres https"}` : "☀️ Ekran nie zgaśnie" }), _jsxs("div", { className: "cooking-body", onTouchStart: onTouchStart, onTouchEnd: onTouchEnd, children: [_jsx("h2", { children: recipe.title }), current ? (_jsxs(_Fragment, { children: [_jsx("p", { className: "cooking-step", style: { "--from": `${direction * 24}px` }, onClick: () => readAloud && speak(text), children: text }, step), used.length > 0 && (_jsx("ul", { className: "step-ingredients", children: used.map((i) => (_jsx("li", { children: scaleText(recipe.ingredients[i].text, recipe.ingredients[i].amount, scale) }, i))) })), findDurations(current.text).map((d, j) => (_jsxs("button", { type: "button", className: "timer-button big", onClick: () => start(`${recipe.title}, krok ${step + 1}: ${d.label}`, d.seconds, recipe.id), children: ["\u23F1 Minutnik ", d.label] }, j))), current.image_url && _jsx("img", { src: current.image_url, alt: "" })] })) : (_jsx("ul", { className: "checklist cooking-ingredients", children: recipe.ingredients.map((ing, i) => (_jsxs("li", { className: checked.has(i) ? "done" : "", role: "checkbox", "aria-checked": checked.has(i), tabIndex: 0, onClick: () => toggleChecked(i), children: [_jsx("span", { className: "check", "aria-hidden": "true" }), _jsx("span", { className: "item-text", children: scaleText(ing.text, ing.amount, scale) })] }, i))) }))] }), _jsxs("div", { className: "cooking-nav", children: [_jsx("button", { type: "button", disabled: step < 0, onClick: () => go(step - 1), children: "\u2039 Wstecz" }), step < last ? (_jsx("button", { type: "button", className: "primary", onClick: () => go(step + 1), children: step < 0 ? "Zaczynamy ›" : "Dalej ›" })) : (_jsx("button", { type: "button", className: "primary", onClick: () => setFinishing(true), children: "\u2705 Ugotowane" }))] }), finishing && _jsx(CookedSheet, { recipe: recipe, onClose: () => setFinishing(false), onSaved: goBack })] }));
}
