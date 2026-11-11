// Testy skali wyglądu: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { clampScale, DEFAULT_SCALES, parseScales, scalesSummary } from "./uiScale.ts";

test("skala co 5% w granicach 50-200", () => {
  assert.equal(clampScale(93), 95);
  assert.equal(clampScale(10), 50);
  assert.equal(clampScale(400), 200);
});

test("zapis z telefonu: brakujące i zepsute wartości = 100%", () => {
  assert.deepEqual(parseScales(null), DEFAULT_SCALES);
  assert.deepEqual(parseScales("{zepsute"), DEFAULT_SCALES);
  const s = parseScales(JSON.stringify({ title: 90, list: "duże", space: 77 }));
  assert.equal(s.title, 90);
  assert.equal(s.list, 100);
  assert.equal(s.space, 75);
});

test("opis ustawień pokazuje tylko zmiany", () => {
  assert.equal(scalesSummary(DEFAULT_SCALES), "wszystko 100%");
  assert.equal(scalesSummary({ ...DEFAULT_SCALES, title: 90, space: 80 }), "Tytuły 90% · Odstępy 80%");
});
