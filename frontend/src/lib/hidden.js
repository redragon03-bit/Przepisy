// Przepisy usunięte przed chwilą, które jeszcze można przywrócić ("Cofnij").
// Lista ich nie pokazuje, choć serwer usunie je dopiero po kilku sekundach.
const hidden = new Set();
export function hideRecipe(id) {
    hidden.add(id);
}
export function unhideRecipe(id) {
    hidden.delete(id);
}
export function isHidden(id) {
    return hidden.has(id);
}
