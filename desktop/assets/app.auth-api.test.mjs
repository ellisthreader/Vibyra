import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authHelpers = readFileSync(new URL("./app.auth-helpers.js", import.meta.url), "utf8");
const state = readFileSync(new URL("../lib/state.mjs", import.meta.url), "utf8");
const apiConfig = readFileSync(new URL("../lib/appApiConfig.mjs", import.meta.url), "utf8");
const launcher = readFileSync(new URL("../../Vibyra Desktop", import.meta.url), "utf8");

test("desktop renderer and bridge use the same configured account API", () => {
  assert.match(launcher, /EXPO_PUBLIC_API_URL/);
  assert.match(launcher, /VIBYRA_DESKTOP_API_URL/);
  assert.match(state, /appApiUrl: APP_API_URL/);
  assert.match(apiConfig, /EXPO_PUBLIC_API_URL/);
  assert.match(apiConfig, /vibyra-production\.up\.railway\.app/);
  assert.match(authHelpers, /currentState\?\.appApiUrl/);
});

test("desktop email auth uses the same-origin bridge instead of a browser cross-origin request", () => {
  assert.match(authHelpers, /fetch\(`\/desktop\/auth\/\$\{action\}`/);
  assert.doesNotMatch(authHelpers, /fetch\(`\$\{appApiBaseUrl\(\)\}\$\{endpoint\}`/);
});
