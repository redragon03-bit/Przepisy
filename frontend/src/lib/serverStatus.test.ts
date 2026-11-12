// Kiedy pokazać „Trwa aktualizacja”: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { isProxyError } from "./serverStatus.ts";

test("502/503/504 od pośrednika (bez opisu) to niedostępny serwer", () => {
  assert.equal(isProxyError(502, undefined), true);
  assert.equal(isProxyError(503, undefined), true);
  assert.equal(isProxyError(504, undefined), true);
});

test("błąd aplikacji z opisem (np. AI) to nie aktualizacja", () => {
  assert.equal(isProxyError(502, "Gemini nie odpowiada"), false);
  assert.equal(isProxyError(500, undefined), false);
  assert.equal(isProxyError(404, undefined), false);
});
