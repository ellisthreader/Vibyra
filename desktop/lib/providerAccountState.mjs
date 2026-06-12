import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function readProviderAuthState(provider, executable) {
  if (provider === "codex") return readCodexAuthState();
  if (provider === "claude") return readClaudeAuthState(executable);
  return readGeminiAuthState();
}

export function readCodexAuthState(authPath = join(codexHome(), "auth.json")) {
  try {
    const parsed = JSON.parse(readFileSync(authPath, "utf8"));
    const connected = Boolean(parsed?.tokens?.access_token || parsed?.tokens?.refresh_token);
    return connected ? {
      connected: true,
      accountLabel: "ChatGPT",
      detail: "Uses your ChatGPT plan through Codex CLI.",
      authMode: "chatgpt",
      updatedAt: String(parsed?.last_refresh || "")
    } : disconnectedState();
  } catch {
    return disconnectedState();
  }
}

export function readClaudeAuthState(executable) {
  const result = spawnSync(executable, ["auth", "status"], {
    cwd: homedir(),
    env: accountStatusEnvironment(),
    encoding: "utf8",
    timeout: 5_000
  });
  if (result.error || result.status !== 0) return disconnectedState();
  return parseClaudeAuthStatus(result.stdout);
}

export function parseClaudeAuthStatus(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    const subscription = String(parsed?.subscriptionType || "").trim();
    const connected = Boolean(parsed?.loggedIn)
      && String(parsed?.authMethod || "").toLowerCase() === "claude.ai";
    return connected ? {
      connected: true,
      accountLabel: String(parsed?.email || "Claude account"),
      detail: subscription
        ? `${titleCase(subscription)} plan through Claude Code.`
        : "Uses your Claude account through Claude Code.",
      authMode: "claude.ai"
    } : disconnectedState();
  } catch {
    return disconnectedState();
  }
}

export function readGeminiAuthState(
  settingsPath = join(geminiHome(), "settings.json"),
  credentialsPath = join(geminiHome(), "oauth_creds.json")
) {
  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    const selected = String(settings?.security?.auth?.selectedType || "");
    const credentials = JSON.parse(readFileSync(credentialsPath, "utf8"));
    const connected = selected === "oauth-personal"
      && Boolean(credentials?.refresh_token || credentials?.access_token);
    return connected ? {
      connected: true,
      accountLabel: "Google account",
      detail: "Uses your Google account through Gemini CLI.",
      authMode: "google"
    } : disconnectedState();
  } catch {
    return disconnectedState();
  }
}

function accountStatusEnvironment() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|SECRET)$/i.test(key)) delete env[key];
  }
  return env;
}

function disconnectedState() {
  return { connected: false, accountLabel: "", detail: "", authMode: "", updatedAt: "" };
}

function titleCase(value) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : "";
}

function codexHome() {
  return String(process.env.CODEX_HOME || "").trim() || join(homedir(), ".codex");
}

function geminiHome() {
  return join(homedir(), ".gemini");
}
