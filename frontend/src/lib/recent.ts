// Ostatnio oglądane przepisy (same numery), pamiętane na tym telefonie.
const KEY = "recent-recipes";
const LIMIT = 8;

export function recentRecipeIds(): number[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function rememberRecipe(id: number) {
  try {
    localStorage.setItem(KEY, JSON.stringify([id, ...recentRecipeIds().filter((x) => x !== id)].slice(0, LIMIT)));
  } catch {
    // tryb prywatny - trudno
  }
}
