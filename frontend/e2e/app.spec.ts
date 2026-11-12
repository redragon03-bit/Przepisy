import { APIRequestContext, expect, Page, request, test } from "@playwright/test";

// Główne ścieżki aplikacji na ekranie telefonu. Dane tworzymy przez API (szybciej niż klikając).
let server: APIRequestContext;

async function addRecipe(title: string, ingredients: string[], steps: string[], extra: object = {}) {
  // Po nieudanym teście Playwright uruchamia beforeAll jeszcze raz - nie dublujemy przepisów
  const existing = (await (await server.get("/api/recipes", { params: { q: title } })).json()) as { id: number; title: string }[];
  const same = existing.find((r) => r.title === title);
  if (same) return same;
  const response = await server.post("/api/recipes", {
    data: { title, servings: "4 porcje", ingredients: ingredients.map((text) => ({ text, name: "" })), steps: steps.map((text) => ({ text })), ...extra },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as { id: number };
}

async function login(page: Page) {
  await page.goto("/");
  await page.getByPlaceholder("Hasło").fill("test");
  await page.getByRole("button", { name: "Zaloguj" }).click();
  await expect(page.getByRole("heading", { name: "Przepisy" })).toBeVisible();
}

test.beforeAll(async ({ baseURL }) => {
  server = await request.newContext({ baseURL, extraHTTPHeaders: { "X-App-Password": "test" } });
  await addRecipe("Żurek śląski", ["500 g kiełbasy białej", "1 l zakwasu"], ["Gotuj kiełbasę 20 min.", "Wlej 1 l zakwasu."], { categories: ["Zupa"] });
  await addRecipe("Naleśniki", ["200 g mąki pszennej", "2 jajka", "500 ml mleka"], ["Wymieszaj 200 g mąki z mlekiem.", "Smaż 2 min z każdej strony."]);
  await addRecipe("Sałatka grecka", ["2 pomidory", "1 ogórek", "200 g fety"], ["Pokrój warzywa."]);
});

test.afterAll(async () => {
  await server.dispose();
});

test("szukanie bez ogonków i powrót do listy z zachowanym filtrem", async ({ page }) => {
  await login(page);
  await page.getByPlaceholder("Szukaj w przepisach…").fill("zurek");
  await expect(page.locator(".grid .card")).toHaveCount(1);
  await expect(page.locator(".grid .card")).toContainText("Żurek śląski");

  // Szukanie po składniku
  await page.getByPlaceholder("Szukaj w przepisach…").fill("feta");
  await expect(page.locator(".grid .card")).toHaveCount(1);
  await expect(page.locator(".grid .card")).toContainText("Sałatka grecka");
  await page.locator(".grid .card").first().click();
  await expect(page.getByRole("heading", { name: "Sałatka grecka" })).toBeVisible();
  await page.getByRole("button", { name: "‹ Wróć" }).click();
  await expect(page.getByPlaceholder("Szukaj w przepisach…")).toHaveValue("feta");

  // Przycisk × czyści pole i znika
  await page.getByRole("button", { name: "Wyczyść wyszukiwanie" }).click();
  await expect(page.getByPlaceholder("Szukaj w przepisach…")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Wyczyść wyszukiwanie" })).toHaveCount(0);
  await expect(page.locator(".grid .card")).not.toHaveCount(1);

  // Szukanie w krokach przepisu
  await page.getByPlaceholder("Szukaj w przepisach…").fill("pokroj");
  await expect(page.locator(".grid .card")).toHaveCount(1);
  await expect(page.locator(".grid .card")).toContainText("Sałatka grecka");
});

test("przewodnik „Jak używać” pod „Więcej”", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Więcej" }).click();
  await page.getByRole("link", { name: "Jak używać" }).click();
  await expect(page.getByRole("heading", { name: "Jak używać" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Tryb gotowania/ })).toBeVisible();
});

test("menu ⋯ na przepisie, przeliczanie ilości w krokach i minutnik na innych ekranach", async ({ page }) => {
  await login(page);
  await page.locator(".grid .card", { hasText: "Naleśniki" }).click();
  // Na dole przepisu został tylko jeden przycisk akcji
  await expect(page.locator(".recipe .actions button")).toHaveCount(1);

  await page.getByRole("button", { name: "Więcej porcji" }).click();
  await page.getByRole("button", { name: "Więcej porcji" }).click();
  await page.getByRole("button", { name: "Więcej porcji" }).click();
  await page.getByRole("button", { name: "Więcej porcji" }).click();
  // 8 porcji zamiast 4: ilości w składnikach i w krokach razy 2, czasy bez zmian
  await expect(page.getByText("400 g mąki pszennej")).toBeVisible();
  await expect(page.getByText("Wymieszaj 400 g mąki z mlekiem.")).toBeVisible();
  await expect(page.getByText("Smaż 2 min z każdej strony.")).toBeVisible();

  await page.getByRole("button", { name: "⏱ 2 min" }).click();
  await page.getByRole("button", { name: "Więcej akcji" }).click();
  for (const name of ["Edytuj", "Zaplanuj", "Do zakupów", "Udostępnij", "Zdjęcie", "Usuń"]) {
    await expect(page.getByRole("dialog").getByRole("button", { name })).toBeVisible();
  }
  await page.getByRole("dialog").getByRole("button", { name: "Zaplanuj" }).click();
  await page.getByRole("button", { name: "Jutro" }).click();
  await expect(page.getByRole("status")).toContainText("Zaplanowano");

  // Minutnik działa dalej na liście przepisów
  await page.getByRole("button", { name: "‹ Wróć" }).click();
  await expect(page.locator(".timers")).toContainText("Naleśniki, krok 2");
});

test("usunięcie przepisu można cofnąć", async ({ page }) => {
  const { id } = await addRecipe("Do usunięcia", ["1 jajko"], ["Ugotuj."]);
  await login(page);
  await page.goto(`/przepis/${id}`);
  await page.getByRole("button", { name: "Więcej akcji" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Usuń" }).click();
  await expect(page.getByRole("status")).toContainText("Usunięto „Do usunięcia”");
  await expect(page.locator(".grid")).not.toContainText("Do usunięcia");
  await page.getByRole("button", { name: "Cofnij" }).click();
  await expect(page.getByRole("heading", { name: "Do usunięcia" })).toBeVisible();
  // Po cofnięciu przepis dalej jest na serwerze
  expect((await server.get(`/api/recipes/${id}`)).ok()).toBeTruthy();
});

test("lista zakupów: działy sklepu, odhaczanie i czyszczenie z „Cofnij”", async ({ page }) => {
  await server.post("/api/shopping/clear", { params: { only_checked: "false" } });
  await login(page);
  await page.getByRole("link", { name: "Zakupy" }).click();
  for (const item of ["mleko", "2 pomidory", "papier do pieczenia"]) {
    await page.getByPlaceholder("Dopisz, np. papier do pieczenia").fill(item);
    await page.getByRole("button", { name: "Dodaj" }).click();
  }
  // Działy przychodzą z serwera po zapisaniu
  await page.reload();
  await expect(page.getByRole("heading", { name: "Warzywa i owoce" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nabiał i jajka" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Chemia i dom" })).toBeVisible();

  await page.getByText("mleko").click();
  await expect(page.getByRole("heading", { name: "Kupione" })).toBeVisible();
  await page.getByRole("button", { name: "Wyczyść listę" }).click();
  await expect(page.getByText("Lista jest pusta")).toBeVisible();
  await page.getByRole("button", { name: "Cofnij" }).click();
  await expect(page.getByText("2 pomidory")).toBeVisible();
});

test("lista zakupów działa bez internetu", async ({ page, context }) => {
  await server.post("/api/shopping/clear", { params: { only_checked: "false" } });
  await login(page);
  await page.getByRole("link", { name: "Zakupy" }).click();
  await expect(page.getByRole("heading", { name: "Zakupy" })).toBeVisible();
  await context.setOffline(true);
  await page.getByPlaceholder("Dopisz, np. papier do pieczenia").fill("masło");
  await page.getByRole("button", { name: "Dodaj" }).click();
  await expect(page.getByText("Brak połączenia")).toBeVisible();
  await expect(page.getByText("masło")).toBeVisible();
  // Po powrocie internetu zmiana trafia na serwer
  await context.setOffline(false);
  await expect(page.getByText("Brak połączenia")).toBeHidden();
  await expect
    .poll(async () => ((await (await server.get("/api/shopping")).json()) as { text: string }[]).map((i) => i.text))
    .toContain("masło");
});

test("edycja: Anuluj bez zmian nie pyta, wklejenie kilku linijek dodaje składniki", async ({ page }) => {
  const { id } = await addRecipe("Placki", ["1 jajko"], ["Smaż."]);
  await login(page);
  await page.goto(`/przepis/${id}/edytuj`);
  const first = page.getByPlaceholder("200 g mąki pszennej").first();
  await first.focus();
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData("text", "2 jajka\n- 200 g mąki\n• 300 ml mleka");
    document.activeElement!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(page.getByPlaceholder("200 g mąki pszennej")).toHaveCount(3);
  await expect(page.getByPlaceholder("200 g mąki pszennej").nth(2)).toHaveValue("300 ml mleka");

  // Są zmiany - Anuluj pyta; odmowa zostawia formularz
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Anuluj" }).click();
  await expect(page.getByRole("heading", { name: "Edycja" })).toBeVisible();
});

test("edycja nie wisi na „Ładowanie…”, gdy serwer nie odpowie", async ({ page }) => {
  const { id } = await addRecipe("Sernik z bananowym brownie", ["2 banany"], ["Upiecz."]);
  await login(page);
  // Pierwsze wejście bez przepisu w pamięci telefonu: błąd sieci -> komunikat i ponowna próba
  let fail = true;
  await page.route(`**/api/recipes/${id}`, (route) => (fail ? route.abort("failed") : route.continue()));
  await page.goto(`/przepis/${id}/edytuj`);
  await expect(page.getByText("Brak połączenia z serwerem")).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Spróbuj ponownie" }).click();
  await expect(page.getByRole("textbox", { name: "Nazwa" })).toHaveValue("Sernik z bananowym brownie");

  // Przepis otwarty wcześniej (jest w pamięci telefonu) - edycja otwiera się od razu, nawet bez serwera
  await page.goto(`/przepis/${id}`);
  await expect(page.getByRole("heading", { name: "Sernik z bananowym brownie" })).toBeVisible();
  fail = true;
  await page.goto(`/przepis/${id}/edytuj`);
  await expect(page.getByRole("textbox", { name: "Nazwa" })).toHaveValue("Sernik z bananowym brownie");
});

test("ugotowane z oceną i notatką trafia do dziennika", async ({ page }) => {
  const { id } = await addRecipe("Gulasz", ["500 g wołowiny"], ["Duś 90 min."]);
  await login(page);
  await page.goto(`/przepis/${id}`);
  await page.getByRole("button", { name: "✅ Ugotowane" }).click();
  const sheet = page.getByRole("dialog", { name: "Jak wyszło?" });
  await sheet.locator(".stars button").nth(3).click();
  await sheet.getByPlaceholder("Notatka na następny raz").fill("mniej soli");
  await sheet.getByRole("button", { name: "✅ Zapisz" }).click();
  await expect(page.getByRole("status")).toContainText("Smacznego");
  await page.getByRole("button", { name: /Ugotowane 1×/ }).click();
  await expect(page.getByRole("dialog", { name: "Dziennik gotowania" })).toContainText("mniej soli");
  await expect(page.getByLabel("Ocena 4 na 5").first()).toBeVisible();
});

test("spiżarnia: termin zużycia stawia przepis wyżej", async ({ page }) => {
  // Nazwy składników jak od AI (mianownik), żeby pasowały do spiżarni
  const ingredients = [{ text: "4 pomidory", name: "pomidor" }, { text: "1 cebula", name: "cebula" }];
  if (!(await (await server.get("/api/recipes", { params: { q: "Szakszuka" } })).json()).length)
    await server.post("/api/recipes", { data: { title: "Szakszuka", ingredients, steps: [{ text: "Duś." }] } });
  await server.put("/api/pantry", { data: { names: ["jajka", "mleko", "pomidor"] } });
  await login(page);
  await page.goto("/co-ugotowac");
  await page.locator(".chip", { hasText: "pomidor" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Jutro" }).click();
  await expect(page.locator(".chip", { hasText: "⏰ pomidor" })).toBeVisible();
  await expect(page.getByText("Zużyj najpierw: pomidor (jutro)")).toBeVisible();
  await expect(page.locator(".grid .card").first()).toContainText("Szakszuka");
  await expect(page.locator(".grid .card").first()).toContainText("zużyje: pomidor");

  // "Inna data": okno zostaje otwarte przy wyborze dnia, termin zapisuje się po zamknięciu kalendarza
  const inTwoDays = new Date(Date.now() + 2 * 86_400_000);
  const day = `${inTwoDays.getFullYear()}-${String(inTwoDays.getMonth() + 1).padStart(2, "0")}-${String(inTwoDays.getDate()).padStart(2, "0")}`;
  await page.locator(".chip", { hasText: "pomidor" }).click();
  const dateInput = page.getByRole("dialog").locator('input[type="date"]');
  await dateInput.focus(); // jak na iPhonie: kalendarz otwarty, pole ma fokus
  await dateInput.fill(day);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(dateInput).toHaveValue(day);
  // Zamknięcie kalendarza = pole traci fokus. Nowy Chromium bez okna (CI) nie wysyła zdarzeń
  // fokusu, więc wysyłamy je sami.
  await dateInput.dispatchEvent("focusout");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Zużyj najpierw: pomidor (za 2 dni)")).toBeVisible();
});

test("tryb gotowania: składniki przy kroku i ten sam krok po ponownym otwarciu", async ({ page }) => {
  await login(page);
  await page.locator(".grid .card", { hasText: "Żurek śląski" }).click();
  await page.getByRole("link", { name: /Tryb gotowania/ }).click();
  await page.getByRole("button", { name: "Zaczynamy ›" }).click();
  await expect(page.locator(".cooking-step")).toHaveText("Gotuj kiełbasę 20 min.");
  await expect(page.locator(".step-ingredients")).toHaveText("500 g kiełbasy białej");
  await page.getByRole("button", { name: "Dalej ›" }).click();
  // iPhone zamknął aplikację w tle - po otwarciu jesteśmy na tym samym kroku
  await page.reload();
  await expect(page.locator(".cooking-step")).toHaveText("Wlej 1 l zakwasu.");
  await expect(page.getByText("Krok 2 z 2")).toBeVisible();
});

test("otwarty wcześniej przepis działa bez internetu", async ({ page, context }) => {
  await login(page);
  await page.locator(".grid .card", { hasText: "Sałatka grecka" }).click();
  await expect(page.getByText("200 g fety")).toBeVisible();
  await page.getByRole("button", { name: "‹ Wróć" }).click();
  await context.setOffline(true);
  // Lista i przepis z pamięci telefonu
  await page.getByPlaceholder("Szukaj w przepisach…").fill("sałatka");
  await page.locator(".grid .card", { hasText: "Sałatka grecka" }).click();
  await expect(page.getByText("200 g fety")).toBeVisible();
  await context.setOffline(false);
});

test("plan: porcje przeliczają listę zakupów", async ({ page }) => {
  await server.post("/api/shopping/clear", { params: { only_checked: "false" } });
  const recipe = await addRecipe("Gulasz na plan", ["500 g wołowiny"], ["Duś 90 min."]);
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const day = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
  await server.post("/api/plan", { data: { day, recipe_id: recipe.id } });
  await login(page);
  await page.getByRole("button", { name: "Więcej" }).click();
  await page.getByRole("link", { name: "Plan" }).click();
  await page.getByRole("button", { name: "Liczba porcji" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "8", exact: true }).click();
  await expect(page.getByRole("button", { name: "Liczba porcji" }).first()).toHaveText("8 por.");
  await page.getByRole("button", { name: /Składniki z tygodnia/ }).click();
  await expect(page.getByText(/Dodano do listy zakupów/)).toBeVisible();
  const items = (await (await server.get("/api/shopping")).json()) as { text: string }[];
  expect(items.map((i) => i.text)).toContain("1000 g wołowiny");
});

test("promocje: lista ze sklepami, dodanie do zakupów i przepisy z promocji", async ({ page }) => {
  // Gazetki są w internecie i czyta je AI - tutaj podstawiamy gotowe odpowiedzi serwera
  const promo = (id: number, store: string, name: string, ingredient: string, price: string, category = "jedzenie") => ({
    id, store, name, category, ingredient, price, note: "", leaflet: "Gazetka", valid_from: null, valid_to: null,
    discount: id === 1 ? 30 : 0,
    aisle: category === "czystosc" ? "Chemia i dom" : id === 1 ? "Nabiał i jajka" : "Sypkie i makarony",
    aisle_order: category === "czystosc" ? 11 : id === 1 ? 4 : 7,
    image_url: "",
    key: ingredient || name.toLowerCase(),
    favorite: false,
  });
  const promos = [
    promo(1, "Biedronka", "Mleko UHT 3,2%", "mleko", "1,99 zł"),
    promo(2, "Lidl", "Mąka pszenna typ 450", "mąka pszenna", "1,79 zł"),
    promo(3, "Lidl", "Płyn do naczyń Ludwik", "", "4,99 zł", "czystosc"),
  ];
  await page.route("**/api/promotions", (route) => route.fulfill({ json: promos }));
  await page.route("**/api/promotions/favorites", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/promotions/status", (route) =>
    route.fulfill({ json: { stores: ["Lidl", "Biedronka"], running: false, progress: "", last_check: null, errors: [], leaflets: [] } }),
  );
  let added = false;
  await page.route("**/api/promotions/1/shopping", (route) => {
    added = true;
    return route.fulfill({ status: 201, json: { id: 999, text: "Mleko UHT 3,2% (Biedronka 1,99 zł)", recipes: "", checked: false, aisle: "Inne", aisle_order: 99, in_ha: false, promo: "Biedronka 1,99 zł" } });
  });

  await login(page);
  await page.getByRole("button", { name: "Więcej" }).click();
  await page.getByRole("link", { name: "Promocje" }).click();
  await expect(page.getByRole("heading", { name: "Biedronka" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lidl" })).toBeVisible();
  // Działy sklepu i rabat w %
  await expect(page.getByRole("heading", { name: "Nabiał i jajka" })).toBeVisible();
  await expect(page.locator(".promo-discount")).toHaveText("-30%");

  // Szukanie i chowanie sklepu
  await page.getByPlaceholder("Szukaj, np. masło, kurczak…").fill("maka");
  await expect(page.locator(".promo-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Wyczyść wyszukiwanie" }).click();
  await expect(page.getByPlaceholder("Szukaj, np. masło, kurczak…")).toHaveValue("");
  // Chowanie środków czystości, potem całego Lidla
  await page.locator(".chips").getByRole("button", { name: "🧽 Czystość" }).click();
  await expect(page.locator(".promo-row")).toHaveCount(2);
  await page.locator(".chips").getByRole("button", { name: "Lidl" }).click();
  await expect(page.locator(".promo-row")).toHaveCount(1);
  // Filtry zostają po ponownym wejściu
  await page.reload();
  await expect(page.locator(".promo-row")).toHaveCount(1);

  await page.locator(".promo-row").first().click();
  await page.getByRole("button", { name: "🛒 Dodaj do listy zakupów" }).click();
  await expect(page.getByText("Dodano do zakupów: Mleko UHT 3,2%")).toBeVisible();
  expect(added).toBeTruthy();

  // Przepisy z promocji (prawdziwe dopasowanie na serwerze nie widzi podstawionych promocji - też podstawiamy)
  const naleśniki = await addRecipe("Naleśniki", [], []);
  await page.route("**/api/promotions/recipes", async (route) => {
    const recipe = await (await server.get(`/api/recipes/${naleśniki.id}`)).json();
    return route.fulfill({ json: [{ recipe, promos: [{ ingredient: "mleko", store: "Biedronka", label: "Biedronka 1,99 zł" }] }] });
  });
  await page.getByRole("link", { name: "Co ugotuję?" }).click();
  await expect(page.getByRole("heading", { name: "🏷️ Z promocji" })).toBeVisible();
  await expect(page.getByText("🏷️ mleko (Biedronka 1,99 zł)")).toBeVisible();
  // Wybór sklepu w sekcji: bez Biedronki przepis znika
  const promoBox = page.locator("section.box", { has: page.getByRole("heading", { name: "🏷️ Z promocji" }) });
  await promoBox.getByRole("button", { name: "Biedronka" }).click();
  await expect(page.getByText("🏷️ mleko (Biedronka 1,99 zł)")).toHaveCount(0);
  await promoBox.getByRole("button", { name: "Biedronka" }).click();

  // Plakietka przy składniku w przepisie
  await page.getByText("🏷️ mleko (Biedronka 1,99 zł)").click();
  await expect(page.getByRole("heading", { name: "Naleśniki" })).toBeVisible();
});

test("import: zawieszony import da się anulować", async ({ page }) => {
  let jobs = [{ id: 1, kind: "url", source: "https://aniagotuje.pl/przepis/ciapkapusta", status: "running", error: "", recipe_id: null, recipe_count: 0, created_at: "2026-11-10T08:00:00" }];
  await page.route("**/api/imports", (route) => route.fulfill({ json: jobs }));
  await page.route("**/api/imports/1", (route) => {
    expect(route.request().method()).toBe("DELETE");
    jobs = [];
    return route.fulfill({ status: 204 });
  });
  await login(page);
  await page.goto("/dodaj");
  await expect(page.getByText("⏳ czytam przepis…")).toBeVisible();
  await page.getByRole("button", { name: "anuluj" }).click();
  await expect(page.getByText("aniagotuje.pl/przepis/ciapkapusta")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Ostatnie importy" })).toHaveCount(0);
});

test("ceny z promocji przy składnikach można wyłączyć w Ustawieniach", async ({ page }) => {
  const promo = (id: number, name: string, ingredient: string, price: string) => ({
    id, store: "Biedronka", name, category: "jedzenie", ingredient, price, note: "", leaflet: "Gazetka",
    valid_from: null, valid_to: null, discount: 0, aisle: "Mięso", aisle_order: 1, image_url: "", key: ingredient, favorite: false,
  });
  // AI przypisało schabowi także "sól" - przy soli ceny schabu nie pokazujemy
  await page.route("**/api/promotions", (route) =>
    route.fulfill({ json: [promo(1, "Schab wieprzowy bez kości", "schab", "14,99 zł/kg"), promo(2, "Schab wieprzowy bez kości", "sól", "14,99 zł/kg")] }),
  );
  const response = await server.post("/api/recipes", {
    data: {
      title: "Kotlety schabowe", servings: "4 porcje", steps: [{ text: "Usmaż." }],
      ingredients: [{ text: "4 kotlety ze schabu", name: "schab" }, { text: "1/2 łyżeczki soli", name: "sól" }],
    },
  });
  const { id } = (await response.json()) as { id: number };

  await login(page);
  await page.goto(`/przepis/${id}`);
  await expect(page.locator(".checklist .tag-promo")).toHaveCount(1);
  await expect(page.locator(".checklist li", { hasText: "schabu" }).locator(".tag-promo")).toHaveText("🏷️ Biedronka 14,99 zł/kg");

  await page.goto("/ustawienia");
  const toggle = page.getByRole("switch", { name: "Pokazuj ceny z promocji przy składnikach" });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();

  await page.goto(`/przepis/${id}`);
  await expect(page.getByRole("heading", { name: "Kotlety schabowe" })).toBeVisible();
  await expect(page.locator(".tag-promo")).toHaveCount(0);
  // Wybór zostaje zapamiętany
  await page.reload();
  await expect(page.getByRole("heading", { name: "Kotlety schabowe" })).toBeVisible();
  await expect(page.locator(".tag-promo")).toHaveCount(0);
});

test("konta: właściciel dodaje domownika, a ten widzi przepisy, ale zmienia tylko swoje", async ({ page }) => {
  await login(page);
  await page.goto("/ustawienia");
  await page.getByPlaceholder("Nazwa nowego konta, np. imię").fill("Naszman");
  await page.getByPlaceholder("Hasło (min. 4 znaki)").fill("brat123");
  await page.getByRole("button", { name: "Dodaj konto" }).click();
  await expect(page.locator(".account-list")).toContainText("Naszman");
  await page.screenshot({ path: "test-results/konta-wlasciciel.png" });
  await page.getByRole("button", { name: /^Wyloguj/ }).click();

  await page.getByPlaceholder("Nazwa konta").fill("Naszman");
  await page.getByPlaceholder("Hasło").fill("brat123");
  await page.getByRole("button", { name: "Zaloguj" }).click();
  await expect(page.getByRole("button", { name: "Wyloguj (Naszman)" })).toBeVisible();
  await page.goto("/");
  await expect(page.getByText("Naleśniki")).toBeVisible();
  await page.getByText("Naleśniki").click();
  await page.getByRole("button", { name: "Więcej akcji" }).click();
  await expect(page.getByRole("button", { name: "Zaplanuj" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edytuj" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Usuń" })).toHaveCount(0);

  await page.goto("/ustawienia");
  await expect(page.getByRole("heading", { name: "Twoje konto" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kopia zapasowa" })).toHaveCount(0);
  await page.screenshot({ path: "test-results/konta-domownik.png" });
  await page.getByRole("button", { name: /^Wyloguj/ }).click();
});

test("wygląd: skala grup co 5% w Ustawieniach, zapamiętana w telefonie", async ({ page }) => {
  await login(page);
  await page.goto("/ustawienia");
  const smaller = page.getByRole("button", { name: "Tytuły: mniejsze" });
  await smaller.click();
  await smaller.click();
  await expect(page.getByLabel("Tytuły: wielkość")).toHaveText("90%");
  await expect(page.getByText("Ustawione teraz:")).toContainText("Tytuły 90%");
  // h1 ma 1.5rem = 24 px, po zmianie 90%
  const h1Size = () => page.locator("h1").first().evaluate((e) => getComputedStyle(e).fontSize);
  expect(await h1Size()).toBe("21.6px");
  // Odstępy i kółka też osobno
  await page.getByRole("button", { name: "Kółka do odhaczania: większe" }).click();
  await expect(page.getByLabel("Kółka do odhaczania: wielkość")).toHaveText("105%");

  await page.reload();
  await expect(page.getByLabel("Tytuły: wielkość")).toHaveText("90%");
  expect(await h1Size()).toBe("21.6px");

  await page.getByRole("button", { name: "Przywróć 100%" }).click();
  await expect(page.getByText("Ustawione teraz:")).toContainText("wszystko 100%");
  expect(await h1Size()).toBe("24px");
});

test("zdjęcie przepisu: gdy żadne nie pasuje, pokazuje inne albo bierze własne", async ({ page }) => {
  const recipe = await addRecipe("Sernik bez zdjęcia", ["1 kg twarogu"], ["Upiecz."]);
  const svg = (label: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><text y="20">${label}</text></svg>`)}`;
  const first = ["a", "b", "c", "d"].map(svg);
  const second = ["e", "f"].map(svg);
  let asked: { skip: string[]; round: number } | null = null;
  await page.route(`**/api/recipes/${recipe.id}/image-candidates`, (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: first });
    asked = route.request().postDataJSON();
    return route.fulfill({ json: asked!.round === 1 ? second : [] });
  });
  await login(page);
  await page.goto(`/przepis/${recipe.id}`);
  await page.getByRole("button", { name: "🔍 Znajdź zdjęcie w internecie" }).click();
  await expect(page.locator(".candidates img")).toHaveCount(4);

  // Kolejna partia - bez zdjęć, które już były
  await page.getByRole("button", { name: "🔄 Pokaż inne" }).click();
  await expect(page.locator(".candidates img")).toHaveCount(2);
  expect(asked).toEqual({ skip: first, round: 1 });
  // Gdy nic więcej nie ma, zostają ostatnie propozycje i podpowiedź
  await page.getByRole("button", { name: "🔄 Pokaż inne" }).click();
  await expect(page.getByText("Nie znalazłem już innych zdjęć")).toBeVisible();
  await expect(page.locator(".candidates img")).toHaveCount(2);

  // Własne zdjęcie z telefonu
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  await page.locator(".image-candidates input[type=file]").setInputFiles({ name: "sernik.png", mimeType: "image/png", buffer: png });
  await expect(page.locator("img.hero")).toBeVisible();
  await expect(page.locator(".image-candidates")).toHaveCount(0);
});

test("aktualizacja dodatku: ekran „Trwa aktualizacja” zamiast czarnego, potem aplikacja wraca sama", async ({ page }) => {
  await login(page);
  // Tailscale/HA odpowiada 502 bez treści, gdy dodatek się aktualizuje
  await page.route("**/api/**", (route) => route.fulfill({ status: 502, body: "" }));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Trwa aktualizacja" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pracuj bez połączenia" })).toBeVisible();

  // Serwer wraca - aplikacja sama się przeładowuje
  await page.unroute("**/api/**");
  await expect(page.getByRole("heading", { name: "Przepisy" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("heading", { name: "Trwa aktualizacja" })).toHaveCount(0);
});

test("błąd AI (502 z opisem) nie zasłania aplikacji ekranem aktualizacji", async ({ page }) => {
  await login(page);
  await page.route("**/api/recipes/stats", (route) => route.fulfill({ status: 502, json: { detail: "Gemini nie odpowiada" } }));
  await page.route("**/api/recipes?**", (route) => route.fulfill({ status: 502, json: { detail: "Gemini nie odpowiada" } }));
  await page.reload();
  await page.waitForTimeout(1000);
  await expect(page.getByRole("heading", { name: "Trwa aktualizacja" })).toHaveCount(0);
});

// Przeciągnięcie palcem (zdarzenia dotyku jak na iPhonie, nie myszą)
async function touchDrag(page: Page, from: { x: number; y: number }, toY: number) {
  const cdp = await page.context().newCDPSession(page);
  const point = (y: number) => [{ x: from.x, y, id: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(from.y) });
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(from.y + ((toY - from.y) * i) / steps) });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test("sekcje: kroki i składniki w sekcjach, przeciąganie kroku palcem", async ({ page }) => {
  const { id } = await addRecipe("Ziemniaki z kapustą", ["1 kg ziemniaków", "500 g kapusty kiszonej"], [
    "Odlej wodę i utłucz ziemniaki.",
    "Ugotuj ziemniaki do miękkości.",
    "Duś kapustę 30 min.",
  ]);
  await login(page);
  await page.goto(`/przepis/${id}/edytuj`);
  const stepFields = page.locator(".step-row textarea");
  await expect(stepFields.first()).toHaveValue("Odlej wodę i utłucz ziemniaki.");

  // Krok 1 przeciągnięty za numer pod krok 2
  const handle = page.locator(".step-row .step-number").first();
  await handle.scrollIntoViewIfNeeded();
  const box = (await handle.boundingBox())!;
  const second = (await page.locator(".step-row").nth(1).boundingBox())!;
  await touchDrag(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, second.y + second.height * 0.8);
  await expect(stepFields.first()).toHaveValue("Ugotuj ziemniaki do miękkości.");
  await expect(stepFields.nth(1)).toHaveValue("Odlej wodę i utłucz ziemniaki.");

  // Sekcja na końcu kroków, potem przeniesiona nad pierwszy krok
  const addStepSection = page.locator(".add-buttons").nth(1).getByRole("button", { name: "+ Sekcja" });
  await addStepSection.click();
  await page.getByLabel("Nazwa sekcji").last().fill("Kapusta");
  // Pusty krok dodany z sekcją usuwamy, a "Duś kapustę" (krok 3) przenosimy pod nagłówek
  await page.locator(".step-row").last().getByRole("button", { name: "Usuń" }).click();
  const third = page.locator(".step-row .step-number").nth(2);
  await third.scrollIntoViewIfNeeded();
  const thirdBox = (await third.boundingBox())!;
  const heading = (await page.locator(".section-row").last().boundingBox())!;
  await touchDrag(page, { x: thirdBox.x + thirdBox.width / 2, y: thirdBox.y + thirdBox.height / 2 }, heading.y + heading.height + 30);
  await expect(page.locator(".step-row textarea").last()).toHaveValue("Duś kapustę 30 min.");

  // Sekcja w składnikach
  await page.locator(".add-buttons").first().getByRole("button", { name: "+ Sekcja" }).click();
  await page.getByLabel("Nazwa sekcji").first().fill("Kapusta");
  await page.getByPlaceholder("200 g mąki pszennej").last().fill("1 cebula");
  await page.screenshot({ path: "test-results/sekcje-edycja.png", fullPage: true });

  await page.getByRole("button", { name: "Zapisz" }).click();
  await expect(page.getByRole("heading", { name: "Ziemniaki z kapustą" })).toBeVisible();
  await expect(page.locator("h3.section-title", { hasText: "Kapusta" })).toHaveCount(2);
  await expect(page.locator(".steps li p").first()).toHaveText("Ugotuj ziemniaki do miękkości.");
  await page.screenshot({ path: "test-results/sekcje-przepis.png", fullPage: true });

  // Po ponownym otwarciu edycji sekcje wracają jako nagłówki
  await page.goto(`/przepis/${id}/edytuj`);
  await expect(page.getByLabel("Nazwa sekcji")).toHaveCount(2);
});
