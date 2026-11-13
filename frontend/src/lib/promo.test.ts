// Testy dopasowania promocji do składników: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { nameFits, promoLabel, promoLabels, promoMatches, validLabel } from "./promo.ts";

const promo = (store: string, ingredient: string, price: string, name = ingredient) =>
  ({ id: 1, store, ingredient, price, name, note: "", leaflet: "", valid_from: null, valid_to: null });

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

test("bez plakietki, gdy nazwa z gazetki nie pasuje do składnika", () => {
  // AI przypisało schabowi "sól" i "pieprz" - nie pokazujemy ceny schabu przy soli
  const promos = [
    promo("Biedronka", "schab", "14,99 zł/kg", "Schab wieprzowy bez kości"),
    promo("Biedronka", "sól", "14,99 zł/kg", "Schab wieprzowy bez kości"),
    promo("Biedronka", "pieprz", "14,99 zł/kg", "Schab wieprzowy bez kości"),
  ];
  assert.equal(promoLabel("sól", promos), "");
  assert.equal(promoLabel("pieprz", promos), "");
  assert.equal(promoLabel("schab", promos), "Biedronka 14,99 zł/kg");
  assert.ok(nameFits("Jaja z wolnego wybiegu M", "jajko"));
  assert.ok(nameFits("Udka z kurczaka", "udo z kurczaka"));
  assert.ok(nameFits("Sól himalajska różowa", "sól"));
  assert.ok(nameFits("", "sól"));
});

test("daty obowiązywania", () => {
  const today = new Date(2026, 10, 3);
  assert.equal(validLabel("2026-11-02", "2026-11-07", today), "do 7.11");
  assert.equal(validLabel("2026-11-09", "2026-11-14", today), "od 9.11 do 14.11");
  assert.equal(validLabel(null, null, today), "");
});

test("sok to nie sok z cytryny; dokładniejsze słowa muszą być w nazwie produktu", () => {
  const promos = [promo("Biedronka", "sok", "19,99 zł", "Sok pomarańczowy 6 x 1 l")];
  assert.equal(promoLabel("sok z cytryny", promos), "");
  const lemon = [promo("Lidl", "sok", "3,49 zł", "Sok z cytryn 100% 200 ml")];
  assert.equal(promoLabel("sok z cytryny", lemon), "Lidl 3,49 zł");
  assert.equal(promoLabel("kurczak piersi", [promo("Lidl", "kurczak", "12,49 zł", "Filet z piersi kurczaka")]), "Lidl 12,49 zł");
});

test("po jednej promocji z każdego sklepu, bez odznaczonych sklepów", () => {
  const promos = [
    promo("Biedronka", "masło", "2,49 zł", "Masło ekstra"),
    promo("Lidl", "masło", "5,99 zł", "Masło osełka"),
    promo("Lidl", "masło", "6,49 zł", "Masło Łaciate"),
    promo("Kaufland", "masło", "4,99 zł", "Masło polskie"),
  ];
  assert.deepEqual(promoLabels("masło", promos), ["Biedronka 2,49 zł", "Lidl 5,99 zł", "Kaufland 4,99 zł"]);
  assert.deepEqual(promoLabels("masło", promos, new Set(["Biedronka", "Lidl"])), ["Kaufland 4,99 zł"]);
  assert.equal(promoLabel("masło", promos, new Set(["Biedronka"])), "Lidl 5,99 zł");
});
