import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("GitHub integration IPC exposes the native authorization lifecycle", () => {
  const ipc = source("../src/ipc/github.ts");

  for (const command of [
    "github_integration_status",
    "github_connect",
    "github_cancel_connect",
    "github_disconnect",
    "github_open_install",
  ]) {
    assert.match(ipc, new RegExp(`invoke\\("${command}"`));
  }
  assert.match(ipc, /permissionsReady: boolean/);
  assert.match(ipc, /login: string \| null/);
});

test("the store accepts authoritative native status for every account action", () => {
  const store = source("../src/state/githubIntegrationStore.ts");

  assert.match(store, /const status = await action\(\);\s*if \(request === latestRequest\) set\(\{ status, error: status\.error \}\)/);
  assert.match(store, /refreshInFlight = githubIntegrationStatus\(\)/);
  assert.match(store, /if \(refreshInFlight\) return refreshInFlight/);
  assert.doesNotMatch(store, /connected:\s*true/, "the renderer must not claim auth succeeded");
  assert.doesNotMatch(store, /permissionsReady:\s*true/, "the renderer must not invent scopes");
});

test("the settings card covers safe setup, authorization, and disconnect states", () => {
  const card = source("../src/components/settings/GithubIntegrationCard.tsx");
  const pane = source("../src/components/settings/SettingsIntegrationsPane.tsx");

  for (const label of ["Checking", "CLI required", "Authorizing", "Not connected", "Connected", "Failed"]) {
    assert.match(card, new RegExp(`label=.*${label}`));
  }
  assert.match(card, /public and private repositories/);
  assert.match(card, /Actions workflow files/);
  assert.match(card, /and gists/);
  assert.match(card, /organization-admin/);
  assert.match(card, /repository-deletion access/);
  assert.match(card, /Credentials stay in the official GitHub CLI/);
  assert.match(card, /Paste the copied one-time code/);
  assert.match(card, /githubOpenInstall\(\)/);
  assert.match(card, /removes the local GitHub CLI authorization/);
  assert.match(card, /GitHub does not revoke the token/);
  assert.match(card, /retrySetup \? connect\(\) : refresh\(\)/);
  assert.match(card, /Try setup again/);
  assert.match(pane, /<GithubIntegrationCard \/>/);
});

test("status polling exists only while native authorization is active", () => {
  const card = source("../src/components/settings/GithubIntegrationCard.tsx");

  assert.match(card, /if \(!status\?\.connecting\) return;[\s\S]*?window\.setInterval/);
  assert.match(card, /window\.clearInterval\(timer\)/);
});
