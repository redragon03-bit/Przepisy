// Udostępnianie przepisu jako tekst (Wiadomości, WhatsApp, notatki...).
// Link do aplikacji nic by nie dał - działa tylko w domu - więc wysyłamy całą treść.

import { formatMinutes } from "../api";

interface Shareable {
  title: string;
  description: string;
  servings: string;
  total_minutes: number | null;
  ingredients: string[];
  steps: string[];
  source_url?: string;
}

export function recipeAsText(recipe: Shareable): string {
  const meta = [recipe.servings, recipe.total_minutes ? formatMinutes(recipe.total_minutes) : ""].filter(Boolean).join(" · ");
  return [
    recipe.title,
    recipe.description,
    meta,
    "",
    "Składniki:",
    ...recipe.ingredients.map((line) => `• ${line}`),
    "",
    "Przygotowanie:",
    ...recipe.steps.map((step, i) => `${i + 1}. ${step}`),
    recipe.source_url ? `\nŹródło: ${recipe.source_url}` : "",
  ]
    .filter((line, i) => line !== "" || i > 2)
    .join("\n")
    .trim();
}

// Zwraca komunikat dla użytkownika albo "" (gdy otworzył się systemowy arkusz udostępniania)
export async function shareText(title: string, text: string): Promise<string> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return "";
    } catch (e) {
      // Użytkownik zamknął okno udostępniania - to nie błąd
      if ((e as Error).name === "AbortError") return "";
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "Skopiowano przepis - wklej go w wiadomości.";
  } catch {
    return "Nie udało się udostępnić przepisu.";
  }
}
