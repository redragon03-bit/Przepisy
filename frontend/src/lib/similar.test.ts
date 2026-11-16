// Testy rozpoznawania tego samego produktu: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { covers, findSame, inStock, sameProduct } from "./similar.ts";

test("ten sam produkt mimo szyku, odmiany i ilości", () => {
  assert.ok(sameProduct("Kurczak piersi", "Pierś z kurczaka"));
  assert.ok(sameProduct("pomidory", "2 kg pomidorów"));
  assert.ok(sameProduct("mleko 2 l", "Mleko"));
  assert.ok(sameProduct("Jajka x10", "jajko"));
});

test("różne produkty się nie łączą", () => {
  assert.ok(!sameProduct("ser", "serek"));
  assert.ok(!sameProduct("pierś z kurczaka", "udko z kurczaka"));
  assert.ok(!sameProduct("mąka pszenna", "mąka"));
  assert.ok(!sameProduct("masło", "masło orzechowe"));
  assert.ok(!sameProduct("", ""));
});

test("findSame zwraca pasującą pozycję", () => {
  const list = [{ text: "Ser" }, { text: "Pierś z kurczaka" }];
  assert.equal(findSame("kurczak piersi", list, (i) => i.text)?.text, "Pierś z kurczaka");
  assert.equal(findSame("  ", list, (i) => i.text), undefined);
});

test("produkt w domu wystarcza na składnik mimo odmiany i dodatkowych słów", () => {
  assert.ok(covers("karkówka", "karkówki wieprzowej"));
  assert.ok(covers("ser", "ser żółty"));
  assert.ok(covers("ser feta", "ser"));
  assert.ok(!covers("ser", "serek"));
  assert.ok(!covers("pomidor", "koncentrat pomidorowy"));
  assert.ok(!covers("jogurt grecki", "jogurt naturalny"));
  assert.ok(!covers("czosnek", "bagiety czosnkowe"));
});

test("sól i pieprz wymaga obu, lub - jednego", () => {
  assert.ok(inStock(["sól", "pieprz"], "sól i pieprz"));
  assert.ok(!inStock(["sól"], "sól i pieprz"));
  assert.ok(inStock(["margaryna"], "masło lub margaryna"));
  assert.ok(inStock(["karkówka"], "karkówki wieprzowej"));
});
