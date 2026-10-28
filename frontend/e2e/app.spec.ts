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
  await page.getByPlaceholder("Szukaj po nazwie albo składniku…").fill("zurek");
  await expect(page.locator(".grid .card")).toHaveCount(1);
  await expect(page.locator(".grid .card")).toContainText("Żurek śląski");

  // Szukanie po składniku
  await page.getByPlaceholder("Szukaj po nazwie albo składniku…").fill("feta");
  await expect(page.locator(".grid .card")).toHaveCount(1);
  await expect(page.locator(".grid .card")).toContainText("Sałatka grecka");
  await page.locator(".grid .card").first().click();
  await expect(page.getByRole("heading", { name: "Sałatka grecka" })).toBeVisible();
  await page.getByRole("button", { name: "‹ Wróć" }).click();
  await expect(page.getByPlaceholder("Szukaj po nazwie albo składniku…")).toHaveValue("feta");
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
  await page.getByPlaceholder("Szukaj po nazwie albo składniku…").fill("sałatka");
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
