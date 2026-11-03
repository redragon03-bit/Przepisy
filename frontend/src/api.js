export class ApiError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
// Ostatni stan logowania - żeby aplikacja otworzyła się bez internetu (np. lista zakupów w sklepie)
const AUTH_KEY = "auth-status";
export function saveAuth(status) {
    try {
        localStorage.setItem(AUTH_KEY, JSON.stringify(status));
    }
    catch {
        // tryb prywatny - bez internetu aplikacja się wtedy nie otworzy, trudno
    }
}
export function savedAuth() {
    try {
        return JSON.parse(localStorage.getItem(AUTH_KEY) ?? "null");
    }
    catch {
        return null;
    }
}
// Wywoływane, gdy serwer odpowie 401 (sesja wygasła) - App.tsx pokazuje wtedy logowanie
let onUnauthorized = () => { };
export function setUnauthorizedHandler(handler) {
    onUnauthorized = handler;
}
async function request(method, path, body, signal) {
    const isForm = body instanceof FormData;
    let response;
    try {
        response = await fetch(path, {
            method,
            credentials: "same-origin",
            headers: body && !isForm ? { "Content-Type": "application/json" } : undefined,
            body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
            signal,
        });
    }
    catch (e) {
        // Przerwanie przez nas (AbortController) przekazujemy dalej bez zmian
        if (signal?.aborted)
            throw e;
        // Safari pisze wtedy "Load failed", Chrome "Failed to fetch" - pokazujemy coś zrozumiałego
        throw new ApiError(0, "Brak połączenia z serwerem - spróbuj jeszcze raz.");
    }
    if (response.status === 401 && path !== "/api/auth/login")
        onUnauthorized();
    if (!response.ok) {
        let message = `Błąd ${response.status}`;
        try {
            const data = await response.json();
            if (typeof data.detail === "string")
                message = data.detail;
        }
        catch {
            // odpowiedź bez JSON - zostaje ogólny komunikat
        }
        throw new ApiError(response.status, message);
    }
    if (response.status === 204)
        return undefined;
    return response.json();
}
function query(params) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        for (const v of Array.isArray(value) ? value : [value])
            if (v)
                search.append(key, v);
    }
    const text = search.toString();
    return text ? `?${text}` : "";
}
export const api = {
    authStatus: () => request("GET", "/api/auth/status"),
    login: (password) => request("POST", "/api/auth/login", { password }),
    logout: () => request("POST", "/api/auth/logout"),
    // category: nazwa kategorii, "-" = przepisy bez kategorii, "" = wszystkie
    listRecipes: (q, ingredients, category = "", favorite = false) => request("GET", `/api/recipes${query({ q, ingredients, category, favorite: favorite ? "true" : "" })}`),
    recipeStats: () => request("GET", "/api/recipes/stats"),
    getRecipe: (id) => request("GET", `/api/recipes/${id}`),
    createRecipe: (data) => request("POST", "/api/recipes", data),
    updateRecipe: (id, data) => request("PUT", `/api/recipes/${id}`, data),
    deleteRecipe: (id) => request("DELETE", `/api/recipes/${id}`),
    // Ulubione / ocena (0 = usuń) / notatki bez wysyłania całego formularza
    patchRecipe: (id, data) => request("PATCH", `/api/recipes/${id}`, data),
    imageCandidates: (id) => request("GET", `/api/recipes/${id}/image-candidates`),
    setImageFromUrl: (id, url) => request("POST", `/api/recipes/${id}/image-from-url`, { url }),
    imageSearchStatus: () => request("GET", "/api/recipes/image-search"),
    startImageSearch: () => request("POST", "/api/recipes/image-search"),
    calculateNutrition: (id) => request("POST", `/api/recipes/${id}/nutrition`),
    // Wpis w dzienniku gotowania; ocena, notatka i zdjęcie są opcjonalne
    markCooked: (id, entry = {}) => {
        const form = new FormData();
        if (entry.rating)
            form.append("rating", String(entry.rating));
        if (entry.note)
            form.append("note", entry.note);
        if (entry.photo)
            form.append("photo", entry.photo);
        return request("POST", `/api/recipes/${id}/cooked`, form);
    },
    deleteCooked: (id, entryId) => request("DELETE", `/api/recipes/${id}/cooked/${entryId}`),
    substitute: (id, ingredient) => request("POST", `/api/recipes/${id}/substitute`, { ingredient }),
    createVariant: (id, wish) => request("POST", `/api/recipes/${id}/variant`, { wish }),
    uploadRecipeImage: (id, file) => {
        const form = new FormData();
        form.append("file", file);
        return request("POST", `/api/recipes/${id}/image`, form);
    },
    listCategories: () => request("GET", "/api/categories"),
    autoCategorize: () => request("POST", "/api/categories/auto"),
    listIngredients: (q = "", staplesOnly = false) => request("GET", `/api/ingredients${query({ q, staples_only: staplesOnly ? "true" : "" })}`),
    setStaple: (id, isStaple) => request("PATCH", `/api/ingredients/${id}`, { is_staple: isStaple }),
    // Ten sam produkt zapisany na kilka sposobów ("pomidor", "pomidory") i ich łączenie
    findDuplicateIngredients: () => request("GET", "/api/ingredients/duplicates"),
    mergeIngredients: (keep, others) => request("POST", "/api/ingredients/merge", { keep, others }),
    addStaple: (name) => request("POST", "/api/ingredients/staples", { name }),
    whatCanICook: (ingredients, maxMissing) => request("POST", "/api/cook", { ingredients, max_missing: maxMissing }),
    listShopping: () => request("GET", "/api/shopping"),
    addShoppingItem: (text) => request("POST", "/api/shopping", { text }),
    addRecipeToShopping: (recipeId, factor = 1) => request("POST", "/api/shopping/from-recipe", { recipe_id: recipeId, factor }),
    addPlanToShopping: (start, end) => request("POST", "/api/shopping/from-plan", { start, end }),
    setShoppingChecked: (id, checked) => request("PATCH", `/api/shopping/${id}`, { checked }),
    deleteShoppingItem: (id) => request("DELETE", `/api/shopping/${id}`),
    clearShopping: (onlyChecked) => request("POST", `/api/shopping/clear${query({ only_checked: onlyChecked ? "true" : "false" })}`),
    sendShoppingToHa: () => request("POST", "/api/shopping/send-to-ha"),
    // Zmiany z listy w Home Assistant (odhaczenia, nowe pozycje) + cała lista
    syncShopping: () => request("POST", "/api/shopping/sync"),
    getPantry: () => request("GET", "/api/pantry"),
    setPantry: (names) => request("PUT", "/api/pantry", { names }),
    pantryItems: () => request("GET", "/api/pantry/items"),
    // null = bez terminu
    setPantryExpires: (name, expires) => request("PUT", "/api/pantry/expires", { name, expires }),
    // Backend nie pamięta rozmowy - wysyłamy całą historię (bez list polecanych przepisów)
    chat: (messages, signal) => request("POST", "/api/chat", { messages: messages.map(({ role, text, recipe }) => ({ role, text, recipe: recipe ?? null })) }, signal),
    saveChatRecipe: (recipe) => request("POST", "/api/chat/save", { recipe }),
    listBackups: () => request("GET", "/api/backups"),
    calendarLink: () => request("GET", "/api/calendar/link"),
    restoreBackup: (file) => {
        const form = new FormData();
        form.append("file", file);
        return request("POST", "/api/backup/restore", form);
    },
    listPlan: (start, end) => request("GET", `/api/plan${query({ start, end })}`),
    addToPlan: (day, recipeId) => request("POST", "/api/plan", { day, recipe_id: recipeId }),
    // Na ile porcji gotujemy - przelicza ilości na liście zakupów
    setPlanServings: (id, servings) => request("PATCH", `/api/plan/${id}`, { servings }),
    removeFromPlan: (id) => request("DELETE", `/api/plan/${id}`),
    // Plan od AI układa się w tle - wynik odbieramy przez getPlanSuggestion
    suggestPlan: (days, wishes) => request("POST", "/api/plan/suggest", { days, wishes }),
    getPlanSuggestion: (id) => request("GET", `/api/plan/suggest/${id}`),
    // Promocje z gazetek (Lidl, Biedronka, Kaufland...) - serwer sam sprawdza nowe gazetki co 12 godzin
    listPromotions: () => request("GET", "/api/promotions"),
    promoStatus: () => request("GET", "/api/promotions/status"),
    refreshPromotions: () => request("POST", "/api/promotions/refresh"),
    promoRecipes: () => request("GET", "/api/promotions/recipes"),
    promoToShopping: (id) => request("POST", `/api/promotions/${id}/shopping`),
    // Pomysły od AI układają się w tle - wynik odbieramy przez getPromoIdeas
    promoIdeas: (wishes, stores) => request("POST", "/api/promotions/ideas", { wishes, stores }),
    getPromoIdeas: (id) => request("GET", `/api/promotions/ideas/${id}`),
    // Powiadomienie z Home Assistant o końcu minutnika (gdy ustawiono ha_notify)
    startTimer: (id, label, seconds) => request("POST", "/api/timers", { id, label, seconds }),
    cancelTimer: (id) => request("DELETE", `/api/timers/${id}`),
    // force = importuj, nawet jeśli link już jest w bazie
    importUrl: (url, force = false) => request("POST", "/api/imports/url", { url, force }),
    importText: (text) => request("POST", "/api/imports/text", { text }),
    importImages: (files) => {
        const form = new FormData();
        files.forEach((file) => form.append("files", file));
        return request("POST", "/api/imports/images", form);
    },
    listImports: () => request("GET", "/api/imports"),
    getImport: (id) => request("GET", `/api/imports/${id}`),
    retryImport: (id) => request("POST", `/api/imports/${id}/retry`),
};
export function formatMinutes(minutes) {
    if (!minutes)
        return "";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}
// Data w formacie "2026-10-20" w strefie czasowej telefonu (nie UTC)
export function isoDay(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
