import assert from "node:assert/strict";
import { test } from "node:test";
import { stepIngredients } from "./stepIngredients.ts";

const line = (name: string, section = "") => ({ text: name, name, amount: null, unit: "", original_text: "", section });

test("składniki w krokach z odmianą", () => {
  const ingredients = [line("mąka pszenna"), line("pomidor"), line("masło"), line("jajko"), line("makaron")];
  const steps = ["Przesiej mąkę.", "Pokrój pomidory i podsmaż na maśle.", "Ugotuj makaron al dente.", "Dodaj 2 jajka."];
  assert.deepEqual(stepIngredients(ingredients, steps), [[0], [1, 2], [4], [3]]);
});

test("ruchome e: cukier/cukru, jajko/jajek, ogórek/ogórka, marchew/marchwi", () => {
  const ingredients = [line("cukier"), line("jajko"), line("ogórek"), line("marchew"), line("jajek")];
  const steps = ["Utrzyj z cukrem.", "Dodaj 3 jajka.", "Pokrój ogórki.", "Zetrzyj marchwi trochę.", "Wbij jajko.", "Wsyp cukru i jajek."];
  assert.deepEqual(stepIngredients(ingredients, steps), [[0], [1, 4], [2], [3], [1, 4], [0, 1, 4]]);
});

test("krok w sekcji bierze składniki tylko z tej sekcji", () => {
  const ingredients = [
    line("mąka pszenna", "Ciasto"),
    line("masło", "Ciasto"),
    line("cukier", "Ciasto"),
    line("jajka", "Ciasto"),
    line("jabłka", "Nadzienie"),
    line("masło", "Kruszonka"),
    line("mąka", "Kruszonka"),
  ];
  const steps = [
    { text: "Zagnieść ciasto z mąki, masła, cukru i jajek.", section: "Ciasto" },
    { text: "Zetrzyj masło z mąką.", section: "kruszonka " },
    // Sekcja kroku bez pasujących składników - szukamy we wszystkich
    { text: "Wyłóż jabłka i posyp masłem.", section: "Pieczenie" },
  ];
  assert.deepEqual(stepIngredients(ingredients, steps), [[0, 1, 2, 3], [5, 6], [1, 4, 5]]);
});
