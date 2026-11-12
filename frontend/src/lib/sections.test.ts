import assert from "node:assert/strict";
import { test } from "node:test";
import { applyOrder, fromRows, groupBySection, toRows } from "./sections.ts";

const items = [
  { text: "jajka", section: "Omlet" },
  { text: "mąka", section: "Omlet" },
  { text: "masło", section: "Krem" },
  { text: "Podawaj", section: "" },
];

test("toRows wstawia nagłówki, fromRows je zdejmuje", () => {
  const rows = toRows(items);
  assert.deepEqual(rows.map((r) => ("heading" in r ? `# ${r.heading}` : r.item.text)), [
    "# Omlet", "jajka", "mąka", "# Krem", "masło", "# ", "Podawaj",
  ]);
  assert.deepEqual(fromRows(rows), items);
});

test("bez sekcji nie ma nagłówków", () => {
  const plain = [{ text: "a" }, { text: "b", section: "" }];
  assert.equal(toRows(plain).length, 2);
});

test("przeciągnięty składnik przejmuje sekcję nagłówka nad nim", () => {
  const rows = toRows(items);
  // "masło" na samą górę, pod "# Omlet"
  const [masło] = rows.splice(4, 1);
  rows.splice(1, 0, masło);
  assert.deepEqual(fromRows(rows).map((i) => `${i.section}:${i.text}`), ["Omlet:masło", "Omlet:jajka", "Omlet:mąka", ":Podawaj"]);
});

test("groupBySection zachowuje numery pozycji", () => {
  const groups = groupBySection(items);
  assert.deepEqual(groups.map((g) => [g.section, g.items.map((i) => i.index)]), [["Omlet", [0, 1]], ["Krem", [2]], ["", [3]]]);
});

test("applyOrder układa według AI, zła długość nic nie zmienia", () => {
  const steps = [{ text: "Odlej wodę" }, { text: "Ugotuj ziemniaki" }];
  assert.deepEqual(applyOrder(steps, [1, 0], ["Ziemniaki", "Ziemniaki"]), [
    { text: "Ugotuj ziemniaki", section: "Ziemniaki" },
    { text: "Odlej wodę", section: "Ziemniaki" },
  ]);
  assert.equal(applyOrder(steps, [0], ["x"]), steps);
});
