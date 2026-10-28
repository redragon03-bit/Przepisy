// Testy przeliczania porcji: npm test (Node uruchamia TypeScript bez budowania)
import assert from "node:assert/strict";
import { test } from "node:test";
import { formatKitchenAmount, scaleStep, scaleText } from "./scale.ts";

test("ułamki w linijce składnika", () => {
  assert.equal(scaleText("1/2 szklanki mleka", null, 2), "1 szklanki mleka");
  assert.equal(scaleText("½ łyżeczki soli", null, 2), "1 łyżeczki soli");
  assert.equal(scaleText("1 1/2 szklanki mąki", 1.5, 2), "3 szklanki mąki");
  assert.equal(scaleText("1/2 szklanki mleka", 0.5, 3), "1 ½ szklanki mleka");
});

test("zakresy", () => {
  assert.equal(scaleText("2-3 ząbki czosnku", 2, 2), "4-6 ząbki czosnku");
  assert.equal(scaleStep("dodaj 2–3 łyżki oleju", 2), "dodaj 4–6 łyżki oleju");
});

test("kroki", () => {
  assert.equal(scaleStep("dodaj 1/2 szklanki mleka", 2), "dodaj 1 szklanki mleka");
  assert.equal(scaleStep("dodaj 1,5 kg mąki i piecz 30 min w 180°C", 2), "dodaj 3 kg mąki i piecz 30 min w 180°C");
  assert.equal(scaleStep("dodaj 250 g masła", 0.5), "dodaj 125 g masła");
});

test("gramy zostają dziesiętne, reszta jako ułamek", () => {
  assert.equal(scaleText("1 kg ziemniaków", 1, 1.5), "1,5 kg ziemniaków");
  assert.equal(formatKitchenAmount(0.25), "¼");
  assert.equal(formatKitchenAmount(2.6), "2,6");
});

test("bez zmian i z dopiskiem", () => {
  assert.equal(scaleText("szczypta soli", null, 2), "szczypta soli");
  assert.equal(scaleText("sól do smaku", 1, 2), "sól do smaku (×2)");
  assert.equal(scaleText("jajka rozmiar L, 2 sztuki", 5, 2), "jajka rozmiar L, 2 sztuki (×2)");
});
