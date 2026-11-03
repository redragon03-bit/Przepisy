// Testy dopasowania promocji do składników: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { promoLabel, promoMatches, validLabel } from "./promo.ts";

const promo = (store: string, ingredient: string, price: string) =>
  ({ id: 1, store, ingredient, price, name: ingredient, note: "", leaflet: "", valid_from: null, valid_to: null });

test("dopasowanie nazw jak na serwerze", () => {
  assert.ok(promoMatches("ser żółty", "ser"));
  assert.ok(promoMatches("mąka", "mąka pszenna"));
  assert.ok(!promoMatches("ser", "serek"));
  assert.ok(!promoMatches("", "ser"));
});

test("plakietka woli dokładną nazwę", () => {
  const promos = [promo("Lidl", "masło klarowane", "9,99 zł"), promo("Biedronka", "masło", "2,49 zł")];
  assert.equal(promoLabel("masło", promos), "Biedronka 2,49 zł");
  assert.equal(promoLabel("pomidor", promos), "");
});

test("daty obowiązywania", () => {
  const today = new Date(2026, 10, 3);
  assert.equal(validLabel("2026-11-02", "2026-11-07", today), "do 7.11");
  assert.equal(validLabel("2026-11-09", "2026-11-14", today), "od 9.11 do 14.11");
  assert.equal(validLabel(null, null, today), "");
});
