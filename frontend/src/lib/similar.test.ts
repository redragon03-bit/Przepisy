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
  assert.ok(covers("pomidory", "pomidorów"));
  for (const [have, needed] of [
    ["ser", "serek"],
    ["pomidor", "koncentrat pomidorowy"],
    ["pomidor", "pomidorowy"],
    ["jogurt grecki", "jogurt naturalny"],
    ["czosnek", "bagiety czosnkowe"],
    ["oliwa", "oliwki zielone"],
    ["olej", "olejek waniliowy"],
    ["cukier", "cukierki"],
    ["kasza gryczana", "kaszanka"],
    ["fasola", "fasolka szparagowa"],
    ["papryka słodka", "papryka"],
    ["mleko kokosowe", "mleko"],
  ]) {
    assert.ok(!covers(have, needed), `${have} / ${needed}`);
  }
});

test("sól i pieprz wymaga obu, lub - jednego, Zawsze w domu tylko dokładnie", () => {
  assert.ok(inStock(["sól", "pieprz"], "sól i pieprz"));
  assert.ok(!inStock(["sól"], "sól i pieprz"));
  assert.ok(inStock([], "sól i pieprz", ["sól", "pieprz"]));
  assert.ok(inStock(["margaryna"], "masło lub margaryna"));
  assert.ok(inStock(["chleb"], "chleb (np. bagietka, ciabatta)"));
  assert.ok(inStock(["karkówka"], "karkówki wieprzowej"));
  for (const needed of ["cukier puder", "olej kokosowy", "oliwki", "sól morska"]) {
    assert.ok(!inStock([], needed, ["cukier", "olej", "oliwa", "sól"]), needed);
  }
});

test("marka po rodzaju: almette = serek almette", () => {
  assert.ok(covers("almette", "serek almette"));
  assert.ok(covers("almette", "1 serek almette"));
  assert.ok(covers("feta", "sera feta"));
  assert.ok(covers("spaghetti", "makaron spaghetti"));
  assert.ok(inStock(["almette"], "serek almette lub bieluch (lub pół na pół)"));
  assert.ok(!covers("almette", "serek"));
  assert.ok(!covers("wieprzowa", "karkówka wieprzowa"));
  assert.ok(!covers("kurczak", "pierś z kurczaka"));
  assert.ok(!covers("rosół", "makaron do rosołu"));
  assert.ok(!covers("spaghetti", "sos do spaghetti"));
  assert.ok(!covers("pomidory", "sos z pomidorów"));
  assert.ok(!covers("curry", "pasta curry"));
});
