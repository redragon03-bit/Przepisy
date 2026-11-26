import { useRemembered } from "./remember";

// Jak pokazywać przepisy na liście: lista z miniaturką albo kafelki trzech wielkości.
// Wybór pod przyciskiem obok kostki w nagłówku Przepisów, zapamiętany w telefonie.
export type RecipeView = "list" | "small" | "medium" | "large";

export const RECIPE_VIEWS: { id: RecipeView; icon: string; label: string }[] = [
  { id: "list", icon: "☰", label: "Lista" },
  { id: "small", icon: "▦", label: "Małe kafelki" },
  { id: "medium", icon: "▣", label: "Średnie kafelki" },
  { id: "large", icon: "■", label: "Duże kafelki" },
];

export function useRecipeView(): [RecipeView, (view: RecipeView) => void] {
  const [view, setView] = useRemembered<RecipeView>("recipe-view", "medium");
  return [RECIPE_VIEWS.some((v) => v.id === view) ? view : "medium", setView];
}
