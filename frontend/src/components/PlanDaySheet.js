import { jsx as _jsx } from "react/jsx-runtime";
import { api } from "../api";
import { dayLabel, nextDays } from "../lib/days";
import { useToast } from "../lib/toast";
import Sheet from "./Sheet";
// Wybór dnia w panelu: stuknięcie w dzień od razu planuje przepis
export default function PlanDaySheet({ recipeId, onClose }) {
    const { toast, run } = useToast();
    const plan = async (day) => {
        onClose();
        if (await run(() => api.addToPlan(day, recipeId)))
            toast(`Zaplanowano na ${dayLabel(day)}.`);
    };
    return (_jsx(Sheet, { title: "Zaplanuj na\u2026", onClose: onClose, list: true, children: nextDays().map(({ day, label }) => (_jsx("button", { type: "button", className: "sheet-row", onClick: () => plan(day), children: label }, day))) }));
}
