import { api, ApiError, ShoppingItem } from "../api";

// Lista zakupów działa też bez internetu (sklep bez zasięgu):
// - ostatnią listę trzymamy w pamięci telefonu i pokazujemy od razu,
// - każdą zmianę najpierw zapisujemy w kolejce, a potem wysyłamy na serwer;
//   bez połączenia zmiany czekają w kolejce i idą, gdy internet wróci.
const ITEMS_KEY = "shopping-items";
const QUEUE_KEY = "shopping-queue";

export type Change =
  | { op: "add"; id: number; text: string } // id ujemne = pozycja jeszcze nie zapisana na serwerze
  | { op: "check"; id: number; checked: boolean }
  | { op: "delete"; id: number }
  | { op: "clear"; onlyChecked: boolean };

function load<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // tryb prywatny - działa, tylko bez zapamiętania
  }
}

export const cachedItems = () => load<ShoppingItem[] | null>(ITEMS_KEY, null);
export const cacheItems = (items: ShoppingItem[]) => store(ITEMS_KEY, items);
export const pendingChanges = () => load<Change[]>(QUEUE_KEY, []);

export function queueChange(change: Change) {
  store(QUEUE_KEY, [...pendingChanges(), change]);
}

let flushing: Promise<boolean> | null = null;
// Numery nadane przez serwer pozycjom dodanym bez internetu (ujemny numer tymczasowy -> prawdziwy)
const realIds = new Map<number, number>();

// Wysyła zmiany z kolejki po kolei. Zwraca false, gdy nie ma połączenia (reszta czeka).
export function sendChanges(): Promise<boolean> {
  // Jedno wysyłanie naraz; kolejne wywołanie w trakcie czeka na to samo
  flushing ??= send().finally(() => {
    flushing = null;
  });
  return flushing;
}

async function send(): Promise<boolean> {
  // Kolejkę czytamy na nowo przy każdej zmianie - w trakcie wysyłania mogą dojść kolejne
  for (let change = pendingChanges()[0]; change; change = pendingChanges()[0]) {
    try {
      if (change.op === "add") {
        realIds.set(change.id, (await api.addShoppingItem(change.text)).id);
      } else if (change.op !== "clear") {
        const id = realIds.get(change.id) ?? change.id;
        // Ujemny numer = pozycja, której dodanie się nie udało - nie ma czego zmieniać
        if (id > 0 && change.op === "check") await api.setShoppingChecked(id, change.checked);
        if (id > 0 && change.op === "delete") await api.deleteShoppingItem(id);
      } else {
        await api.clearShopping(change.onlyChecked);
      }
    } catch (e) {
      // Brak połączenia: kolejka czeka na później. Inny błąd (np. pozycja już usunięta) - pomijamy zmianę.
      if (e instanceof ApiError && e.status === 0) return false;
    }
    store(QUEUE_KEY, pendingChanges().slice(1));
  }
  return true;
}

// Zmiana zastosowana od razu na ekranie (zanim dotrze do serwera)
export function applyChange(items: ShoppingItem[], change: Change): ShoppingItem[] {
  switch (change.op) {
    case "add":
      return [...items, { id: change.id, text: change.text, recipes: "", checked: false, aisle: "Inne", aisle_order: 99, in_ha: false }];
    case "check":
      return items.map((i) => (i.id === change.id ? { ...i, checked: change.checked } : i));
    case "delete":
      return items.filter((i) => i.id !== change.id);
    case "clear":
      return change.onlyChecked ? items.filter((i) => !i.checked) : [];
  }
}
