import assert from "node:assert/strict";
import { test } from "node:test";
import { stepIngredients } from "./stepIngredients.ts";

const line = (name: string) => ({ text: name, name, amount: null, unit: "", original_text: "" });

test("składniki w krokach z odmianą", () => {
  const ingredients = [line("mąka pszenna"), line("pomidor"), line("masło"), line("jajko"), line("makaron")];
  const steps = ["Przesiej mąkę.", "Pokrój pomidory i podsmaż na maśle.", "Ugotuj makaron al dente.", "Dodaj 2 jajka."];
  assert.deepEqual(stepIngredients(ingredients, steps), [[0], [1, 2], [4], [3]]);
});
