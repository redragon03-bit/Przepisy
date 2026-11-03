import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from "react-router-dom";
import { useCheckedSet } from "../../lib/progress";
import { scaleStep } from "../../lib/scale";
import { findDurations } from "../../lib/timers";
import { useTimers } from "../../lib/useTimers";
// Kroki z odhaczaniem; czasy w krokach ("10 min") uruchamiają minutniki,
// a ilości ("200 g mąki") są przeliczane razem z porcjami.
export default function StepsSection({ recipe, scale }) {
    const [checked, toggle] = useCheckedSet(`checked-steps-${recipe.id}`);
    const { start } = useTimers();
    return (_jsxs(_Fragment, { children: [_jsx("h2", { children: "Przygotowanie" }), recipe.steps.length > 0 && (_jsx(Link, { to: `/przepis/${recipe.id}/gotuj?skala=${scale}`, className: "button primary wide", children: "\uD83D\uDC68\u200D\uD83C\uDF73 Tryb gotowania (krok po kroku)" })), _jsx("ol", { className: "steps", children: recipe.steps.map((step, i) => (_jsxs("li", { className: checked.has(i) ? "done" : "", onClick: () => toggle(i), children: [_jsx("span", { className: "step-number", children: i + 1 }), _jsxs("div", { children: [_jsx("p", { children: scaleStep(step.text, scale) }), findDurations(step.text).map((d, j) => (_jsxs("button", { type: "button", className: "timer-button", onClick: (e) => {
                                        e.stopPropagation(); // nie odhaczaj kroku
                                        start(`${recipe.title}, krok ${i + 1}: ${d.label}`, d.seconds, recipe.id);
                                    }, children: ["\u23F1 ", d.label] }, j))), step.image_url && _jsx("img", { src: step.image_url, alt: "", loading: "lazy" })] })] }, i))) })] }));
}
