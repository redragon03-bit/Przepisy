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
