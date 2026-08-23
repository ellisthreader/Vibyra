import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const nativeAuth = readFileSync(new URL("./nativeAuth.ts", import.meta.url), "utf8");
const authActions = readFileSync(new URL("../context/useAuthContextActions.ts", import.meta.url), "utf8");
const authScreen = readFileSync(new URL("../screens/AuthScreen.tsx", import.meta.url), "utf8");
const authRecovery = readFileSync(new URL("../screens/auth/useAuthRecovery.ts", import.meta.url), "utf8");
const deleteSheet = readFileSync(new URL("../screens/workspace/inline/profile/DeleteAccountSheet.tsx", import.meta.url), "utf8");

test("native provider auth uses the official Apple and Google libraries", () => {
  assert.match(nativeAuth, /@react-native-google-signin\/google-signin/);
  assert.match(nativeAuth, /expo-apple-authentication/);
  assert.match(nativeAuth, /webClientId/);
  assert.match(nativeAuth, /identityToken/);
  assert.match(nativeAuth, /\/api\/auth\/provider\/challenge/);
});

test("Expo Go defers the unavailable native Google module", () => {
  const guard = nativeAuth.indexOf("if (isExpoGo)");
  const nativeRequire = nativeAuth.indexOf('require("@react-native-google-signin/google-signin")');
  assert.equal(nativeAuth.includes('import { GoogleSignin }'), false);
  assert.ok(guard >= 0 && nativeRequire > guard);
});

test("provider login sends verified credentials instead of installation identity", () => {
  assert.match(authActions, /authenticateNativeProvider\(method\)/);
  assert.match(authActions, /identityToken: providerCredential\?\.identityToken/);
  assert.doesNotMatch(authActions, /providerId:\s*state\.installId/);
});

test("recovery and provider-aware deletion are exposed in mobile UI", () => {
  assert.match(authScreen, /useAuthRecovery/);
  assert.match(authRecovery, /\/api\/auth\/password\/forgot/);
  assert.match(authRecovery, /\/api\/auth\/password\/reset/);
  assert.match(authRecovery, /\/api\/auth\/email\/resend/);
  assert.match(deleteSheet, /actions\.deleteAccount/);
  assert.match(deleteSheet, /requiresPassword/);
});
