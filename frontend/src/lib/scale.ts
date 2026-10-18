// Przeliczanie porcji. Ta sama logika co scale_text w backend/app/services/shopping.py.

export function formatAmount(amount: number): string {
  const rounded = amount >= 10 ? Math.round(amount) : Math.round(amount * 100) / 100;
  return String(rounded).replace(".", ",");
}

// "4 porcje" -> 4, "na 6 osób" -> 6, "" -> null
export function parseServings(servings: string): number | null {
  const match = servings.match(/\d+/);
  return match ? Number(match[0]) : null;
}

// Zmienia pierwszą liczbę w linijce, jeśli to ta sama ilość co `amount`:
// ("200 g mąki", 200, 1.5) -> "300 g mąki". Inaczej dopisuje "(×1,5)".
export function scaleText(text: string, amount: number | null, factor: number): string {
  if (factor === 1 || amount === null) return text;
  const match = text.match(/\d+(?:[.,]\d+)?/);
  if (match && match.index !== undefined && Math.abs(Number(match[0].replace(",", ".")) - amount) < 0.01) {
    return text.slice(0, match.index) + formatAmount(amount * factor) + text.slice(match.index + match[0].length);
  }
  return `${text} (×${formatAmount(factor)})`;
}
