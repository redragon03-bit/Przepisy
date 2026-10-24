import { api } from "../api";
import { dayLabel, nextDays } from "../lib/days";
import { useToast } from "../lib/toast";
import Sheet from "./Sheet";

// Wybór dnia w panelu: stuknięcie w dzień od razu planuje przepis
export default function PlanDaySheet({ recipeId, onClose }: { recipeId: number; onClose: () => void }) {
  const { toast, run } = useToast();
  const plan = async (day: string) => {
    onClose();
    if (await run(() => api.addToPlan(day, recipeId))) toast(`Zaplanowano na ${dayLabel(day)}.`);
  };
  return (
    <Sheet title="Zaplanuj na…" onClose={onClose} list>
      {nextDays().map(({ day, label }) => (
        <button key={day} type="button" className="sheet-row" onClick={() => plan(day)}>
          {label}
        </button>
      ))}
    </Sheet>
  );
}
