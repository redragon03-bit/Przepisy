import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_THEME, parseTheme, resolveScheme, THEMES, themeVars } from "./theme.ts";

test("zapisany motyw: zły albo brakujący zapis = klasyczny, jak w telefonie", () => {
  assert.deepEqual(parseTheme(null), DEFAULT_THEME);
  assert.deepEqual(parseTheme("{zepsute"), DEFAULT_THEME);
  assert.deepEqual(parseTheme('{"theme":"nieznany","mode":"dark"}'), { theme: "klasyczny", mode: "dark", fx: "subtle" });
  assert.equal(parseTheme('{"theme":"las","mode":"dark","fx":"bold"}').fx, "bold");
  assert.deepEqual(parseTheme('{"theme":"smok","mode":"zly"}'), { theme: "smok", mode: "auto", fx: "subtle" });
});

test("tryb: automatyczny idzie za telefonem, jasny/ciemny na sztywno", () => {
  assert.equal(resolveScheme("auto", true), "dark");
  assert.equal(resolveScheme("auto", false), "light");
  assert.equal(resolveScheme("light", true), "light");
  assert.equal(resolveScheme("dark", false), "dark");
});

// Kontrast WCAG: tekst na tle i tekst na przycisku w kolorze akcentu co najmniej 4.5:1
function lum(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a: string, b: string) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

test("każdy motyw ma czytelne kolory w obu trybach", () => {
  for (const t of THEMES) {
    for (const scheme of ["light", "dark"] as const) {
      const p = t[scheme];
      const name = `${t.label} ${scheme}`;
      assert.ok(contrast(p.text, p.bg) >= 7, `${name}: tekst na tle`);
      assert.ok(contrast(p.muted, p.surface) >= 4.5, `${name}: szary tekst`);
      assert.ok(contrast(p["accent-strong"], p.bg) >= 4.5, `${name}: akcent jako tekst`);
      assert.ok(contrast(p["on-accent"], p["accent-strong"]) >= 4.5, `${name}: tekst na przycisku`);
      assert.ok(contrast(p["on-accent"], p["accent-2"]) >= 4.5, `${name}: tekst na końcu gradientu`);
      assert.ok(contrast(p["on-accent-soft"], p["accent-soft"]) >= 4.5, `${name}: tekst na jasnym akcencie`);
      assert.equal(themeVars(t.id, scheme)["--timer-bg"], p.text);
    }
  }
});
