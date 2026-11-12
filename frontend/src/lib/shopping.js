// Komunikat po dodaniu składników do listy zakupów
export function shoppingMessage(result) {
    const skipped = result.skipped.length ? ` Pominięto, bo masz w domu: ${result.skipped.join(", ")}.` : "";
    const already = result.already ? ` Dania już dodane wcześniej (${result.already}) pominięto.` : "";
    return `Dodano do listy zakupów (${result.added}).${skipped}${already}`;
}
