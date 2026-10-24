// Przepisy usunięte przed chwilą, które jeszcze można przywrócić ("Cofnij").
// Lista ich nie pokazuje, choć serwer usunie je dopiero po kilku sekundach.
const hidden = new Set<number>();

export function hideRecipe(id: number) {
  hidden.add(id);
}

export function unhideRecipe(id: number) {
  hidden.delete(id);
}

export function isHidden(id: number): boolean {
  return hidden.has(id);
}
