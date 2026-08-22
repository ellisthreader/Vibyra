import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

/**
 * The bug this guards: `claude auth login` hands the user a code and then
 * blocks reading stdin. Spawned with stdin on /dev/null it can never be told
 * the code, so connecting an Anthropic account from the pane was impossible —
 * the row simply said "Authorizing" until it was cancelled.
 */
test("a provider sign-in keeps a stdin it can be answered on", () => {
  const auth = source("../src-tauri/src/provider_auth.rs");

  assert.match(auth, /\.stdin\(Stdio::piped\(\)\)/);
  assert.doesNotMatch(
    auth,
    /Stdio::null\(\)/,
    "a login wired to /dev/null cannot receive the code it asks for",
  );
  assert.match(auth, /pub fn submit\(\s*&self,\s*provider_id: &str,\s*account_id: &str,\s*value: &str,?\s*\)/);
});

test("the reply box is wired from the CLI's question to the CLI's stdin", () => {
  const row = source("../src/components/settings/ProviderAccountRow.tsx");
  const reply = source("../src/components/settings/ProviderAccountReply.tsx");
  const card = source("../src/components/settings/ProviderIntegrationCard.tsx");
  const pane = source("../src/components/settings/SettingsIntegrationsPane.tsx");
  const ipc = source("../src/ipc/providerAccounts.ts");

  assert.match(row, /account\.prompt \? \(/);
  assert.match(row, /<ProviderAccountReply prompt=\{account\.prompt\}/);
  assert.match(reply, /onSubmit\(value\)/);
  assert.match(card, /onSubmit=\{\(value\) => onSubmit\(account\.accountId, value\)\}/);
  assert.match(pane, /onSubmit=\{\(account, value\) => void submit\(provider\.id, account, value\)\}/);
  assert.match(
    ipc,
    /invoke\("submit_provider_account_input", \{ provider, account, value \}\)/,
  );
});

/**
 * Every funnel in the app ends at this pane, so every state it can show has to
 * offer something to press. A missing CLI used to render a disabled button
 * above prose telling the user to go and install it themselves.
 *
 * Install now belongs to the card — one CLI serves every account under it —
 * while signing in belongs to each account row.
 */
test("no account state renders an action the user cannot take", () => {
  const card = source("../src/components/settings/ProviderIntegrationCard.tsx");
  const actions = source("../src/components/settings/ProviderAccountActions.tsx");

  assert.match(card, /onClick=\{onInstall\}/);
  assert.match(card, /\{installing \? "Installing…" : "Install"\}/);
  assert.match(card, /onClick=\{onAddAccount\}/, "a card must offer a second account");
  assert.match(actions, /onClick=\{onConnect\}/);
  assert.doesNotMatch(
    card,
    /disabled=\{[^}]*!provider\.installed[^}]*\}[\s\S]{0,80}onClick=\{onInstall\}/,
    "a missing CLI must offer to install itself, not grey the button out",
  );
});

test("the pane can start an install and watches it the way it watches a sign-in", () => {
  const pane = source("../src/components/settings/SettingsIntegrationsPane.tsx");
  const store = source("../src/state/providerAccountStore.ts");

  assert.match(pane, /onInstall=\{\(\) => void install\(provider\.id\)\}/);
  assert.match(pane, /providers\.some\(providerWorking\)/);
  assert.match(store, /install: \(provider\) =>\s*runAction\(set, busyKey\(provider, "install"\)/);
});

/**
 * Two accounts under one company must never share a busy flag: signing one in
 * would grey out the other's buttons.
 */
test("busy state is tracked per account, not per company", () => {
  const store = source("../src/state/providerAccountStore.ts");
  const card = source("../src/components/settings/ProviderIntegrationCard.tsx");

  assert.match(store, /export function busyKey\(provider: string, account: string\)/);
  assert.match(store, /return `\$\{provider\}:\$\{account\}`/);
  assert.match(card, /busy=\{busyKey === accountKey\(provider\.id, account\.accountId\)\}/);
});

/**
 * A sign-in link arrives in pipe-sized chunks and the question that matters
 * comes after it, so a reader that stopped at the first `https://` both
 * truncated the link and never saw the question.
 */
test("login output is read to the end, and a half-written link is not a link", () => {
  const output = source("../src-tauri/src/provider_auth_output.rs");
  const url = source("../src-tauri/src/provider_auth_url.rs");

  assert.match(url, /pub fn find_https_url\(text: &str, at_eof: bool\)/);
  assert.match(url, /None if at_eof => rest,/);
  assert.match(output, /pub fn pending_prompt/);
  assert.doesNotMatch(
    output,
    /return;\s*\n\s*\}\s*\n\s*scan\.push_str/,
    "the reader must keep draining after it finds the sign-in link",
  );
});

test("an uninstalled optional runtime names the command it is missing", () => {
  const runtimes = source("../src/components/settings/TerminalIntegrations.tsx");

  assert.match(runtimes, /Needs the .\$\{agent\.program\}. command on your PATH/);
});
