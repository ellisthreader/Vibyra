import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authHelpers = readFileSync(new URL("./app.auth-helpers.js", import.meta.url), "utf8");
const authSocial = readFileSync(new URL("./app.auth-social.js", import.meta.url), "utf8");
const authUi = readFileSync(new URL("./app.auth-ui.js", import.meta.url), "utf8");
const appHtml = readFileSync(new URL("../app.html", import.meta.url), "utf8");
const authSubmit = readFileSync(new URL("./app.auth-submit.js", import.meta.url), "utf8");
const state = readFileSync(new URL("../lib/state.mjs", import.meta.url), "utf8");
const apiConfig = readFileSync(new URL("../lib/appApiConfig.mjs", import.meta.url), "utf8");
const launcher = readFileSync(new URL("../../Vibyra Desktop", import.meta.url), "utf8");

test("desktop renderer and bridge use the same configured account API", () => {
  assert.match(launcher, /EXPO_PUBLIC_API_URL/);
  assert.match(launcher, /VIBYRA_DESKTOP_API_URL/);
  assert.match(launcher, /vibyra-production\.up\.railway\.app/);
  assert.doesNotMatch(launcher, /EXPO_PUBLIC_API_URL:-http:\/\/127\.0\.0\.1:8000/);
  assert.match(state, /appApiUrl: APP_API_URL/);
  assert.match(apiConfig, /EXPO_PUBLIC_API_URL/);
  assert.match(apiConfig, /vibyra-production\.up\.railway\.app/);
  assert.match(authHelpers, /currentState\?\.appApiUrl/);
});

test("desktop email auth uses the same-origin bridge instead of a browser cross-origin request", () => {
  assert.match(authHelpers, /fetch\(`\/desktop\/auth\/\$\{action\}`/);
  assert.doesNotMatch(authHelpers, /fetch\(`\$\{appApiBaseUrl\(\)\}\$\{endpoint\}`/);
});

test("desktop social auth opens a real provider flow and completes the desktop session", () => {
  assert.match(authUi, /beginDesktopSocialAuth\(button\.dataset\.authSocial\)/);
  assert.match(authSocial, /\/desktop\/auth\/\$\{provider\}\/start/);
  assert.match(authSocial, /\/desktop\/auth\/\$\{provider\}\/status/);
  assert.match(authSocial, /completeDesktopAuth\(result\.token, result\.user, result\.isNewUser\)/);
  assert.match(authSocial, /setDesktopSocialAuthStatus/);
  assert.match(appHtml, /id="desktop-social-auth-status"/);
  assert.doesNotMatch(authUi, /Use email on desktop/);
});

test("desktop auth legal links use the public canonical pages", () => {
  assert.match(authUi, /\/legal\/terms/);
  assert.match(authUi, /\/legal\/privacy/);
});

test("desktop auth keeps new-account state for one launch", () => {
  assert.match(authSubmit, /completeDesktopAuth\(result\.token, result\.user, result\.isNewUser\)/);
  assert.match(authSubmit, /sessionStorage\.setItem\("vibyra\.desktop\.firstWelcomeUserId"/);
  assert.match(authSubmit, /sessionStorage\.removeItem\("vibyra\.desktop\.firstWelcomeUserId"/);
});
