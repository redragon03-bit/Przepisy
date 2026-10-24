import { Recipe } from "../api";

// Ostatnio otwarte przepisy w pamięci: ekran przepisu pokazuje je od razu,
// a świeże dane z serwera podmienia w tle.
const LIMIT = 30;
const cache = new Map<number, Recipe>();

export function cachedRecipe(id: number): Recipe | undefined {
  return cache.get(id);
}

export function cacheRecipe(recipe: Recipe) {
  cache.delete(recipe.id);
  cache.set(recipe.id, recipe);
  if (cache.size > LIMIT) cache.delete(cache.keys().next().value!);
}

export function forgetRecipe(id: number) {
  cache.delete(id);
}
