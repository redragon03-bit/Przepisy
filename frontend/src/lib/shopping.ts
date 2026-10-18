// Komunikat po dodaniu składników do listy zakupów

export function shoppingMessage(result: { added: number; skipped: string[] }): string {
  const skipped = result.skipped.length ? ` Pominięto, bo masz w domu: ${result.skipped.join(", ")}.` : "";
  return `Dodano do listy zakupów (${result.added}).${skipped}`;
}
