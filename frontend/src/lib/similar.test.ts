// Testy rozpoznawania tego samego produktu: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { findSame, sameProduct } from "./similar.ts";

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
