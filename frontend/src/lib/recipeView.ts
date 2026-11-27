import { useRemembered } from "./remember";

// Jak pokazywać przepisy na liście: lista z miniaturką albo kafelki trzech wielkości.
// Wybór pod przyciskiem „Widok” obok „Losuj” w nagłówku Przepisów, zapamiętany w telefonie.
export type RecipeView = "list" | "small" | "medium" | "large";

export const RECIPE_VIEWS: { id: RecipeView; label: string; hint: string }[] = [
  { id: "list", label: "Lista", hint: "zdjęcie i nazwa w wierszu" },
  { id: "small", label: "Małe kafelki", hint: "3 w rzędzie" },
  { id: "medium", label: "Średnie kafelki", hint: "2 w rzędzie" },
  { id: "large", label: "Duże kafelki", hint: "1 w rzędzie" },
];

export function useRecipeView(): [RecipeView, (view: RecipeView) => void] {
  const [view, setView] = useRemembered<RecipeView>("recipe-view", "medium");
  return [RECIPE_VIEWS.some((v) => v.id === view) ? view : "medium", setView];
}
