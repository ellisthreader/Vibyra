import { accessSync, chmodSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { openRouterConfigPaths, parseEnvConfigValue } from "./agentConfig.mjs";

const OPENAI_API_URL = "https://api.openai.com/v1";

export function providerAccountsState() {
  return {
    openai: publicOpenAiAccount(),
    codex: publicCodexAccount()
  };
}

export async function connectOpenAiAccount(body = {}, fetchImpl = fetch) {
  const apiKey = String(body.apiKey || "").trim();
  const organization = String(body.organization || "").trim().slice(0, 120);
  const project = String(body.project || "").trim().slice(0, 120);
  if (!apiKey || apiKey.length < 20) throw httpError(422, "Enter a valid OpenAI API key.");

  await verifyOpenAiKey({ apiKey, organization, project }, fetchImpl);
  const store = readStore();
  store.openai = {
    apiKey,
    organization,
    project,
    updatedAt: new Date().toISOString()
  };
  writeStore(store);
  return publicOpenAiAccount();
}

export function disconnectOpenAiAccount() {
  const store = readStore();
  delete store.openai;
  writeStore(store);
  return publicOpenAiAccount();
}

export function openAiAccountCredential(configPaths = openRouterConfigPaths()) {
  const stored = readStore().openai;
  if (stored?.apiKey) {
    return {
      apiKey: String(stored.apiKey),
      organization: String(stored.organization || ""),
      project: String(stored.project || ""),
      source: "local"
    };
  }
  const configured = openAiEnvironmentCredential(configPaths);
  if (!configured) return null;
  return {
    ...configured,
    source: "env"
  };
}

function openAiEnvironmentCredential(configPaths) {
  const processApiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (processApiKey) {
    return {
      apiKey: processApiKey,
      organization: String(process.env.OPENAI_ORG_ID || process.env.OPENAI_ORGANIZATION || ""),
      project: String(process.env.OPENAI_PROJECT || "")
    };
  }
  for (const path of configPaths) {
    let body = "";
    try {
      body = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    const apiKey = parseEnvConfigValue(body, "OPENAI_API_KEY");
    if (!apiKey) continue;
    return {
      apiKey,
      organization: parseEnvConfigValue(body, "OPENAI_ORG_ID")
        || parseEnvConfigValue(body, "OPENAI_ORGANIZATION"),
      project: parseEnvConfigValue(body, "OPENAI_PROJECT")
    };
  }
  return null;
}

export function openAiHeaders(credential = openAiAccountCredential()) {
  if (!credential?.apiKey) return null;
  return {
    Authorization: `Bearer ${credential.apiKey}`,
    ...(credential.organization ? { "OpenAI-Organization": credential.organization } : {}),
    ...(credential.project ? { "OpenAI-Project": credential.project } : {})
  };
}

function publicOpenAiAccount() {
  const credential = openAiAccountCredential();
  if (!credential) return { provider: "openai", connected: false, source: "", label: "OpenAI" };
  return {
    provider: "openai",
    connected: true,
    source: credential.source,
    label: credential.source === "env" ? "OPENAI_API_KEY" : "OpenAI account",
    last4: credential.apiKey.slice(-4),
    organization: credential.organization ? "set" : "",
    project: credential.project ? "set" : ""
  };
}

function publicCodexAccount() {
  const executable = resolveExecutable(["VIBYRA_CODEX_CLI", "CODEX_CLI_PATH"], "codex");
  const auth = codexAuthState();
  return {
    provider: "codex",
    available: Boolean(executable),
    connected: auth.connected,
    source: auth.source,
    label: auth.connected ? auth.label : "ChatGPT",
    authMode: auth.authMode,
    executable: executable ? "set" : "",
    updatedAt: auth.updatedAt
  };
}

function codexAuthState() {
  const authPath = join(codexHome(), "auth.json");
  try {
    if (!existsSync(authPath)) return { connected: false, source: "", label: "ChatGPT", authMode: "", updatedAt: "" };
    const parsed = JSON.parse(readFileSync(authPath, "utf8"));
    const authMode = String(parsed?.auth_mode || "").toLowerCase();
    const hasChatGptToken = Boolean(parsed?.tokens?.access_token || parsed?.tokens?.refresh_token);
    const hasApiKey = Boolean(parsed?.OPENAI_API_KEY);
    const connected = hasChatGptToken || hasApiKey;
    return {
      connected,
      source: connected ? "codex-cli" : "",
      label: hasChatGptToken ? "ChatGPT via Codex CLI" : hasApiKey ? "OpenAI API key via Codex CLI" : "ChatGPT",
      authMode: authMode || (hasChatGptToken ? "chatgpt" : hasApiKey ? "api" : ""),
      updatedAt: String(parsed?.last_refresh || "")
    };
  } catch {
    return { connected: false, source: "", label: "ChatGPT", authMode: "", updatedAt: "" };
  }
}

async function verifyOpenAiKey(credential, fetchImpl) {
  const response = await fetchImpl(`${OPENAI_API_URL}/models`, {
    headers: {
      Accept: "application/json",
      ...openAiHeaders(credential)
    }
  });
  if (response.ok) return;
  const payload = await response.json().catch(() => ({}));
  throw httpError(response.status || 401, payload?.error?.message || payload?.message || "OpenAI account connection failed.");
}

function readStore() {
  try {
    const storePath = providerStorePath();
    if (!existsSync(storePath)) return {};
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  const storeDir = join(homedir(), ".vibyra-agent");
  const storePath = providerStorePath();
  mkdirSync(storeDir, { recursive: true, mode: 0o700 });
  try { chmodSync(storeDir, 0o700); } catch {}
  writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  try { chmodSync(storePath, 0o600); } catch {}
}

function providerStorePath() {
  return join(homedir(), ".vibyra-agent", "provider-accounts.json");
}

function codexHome() {
  return String(process.env.CODEX_HOME || "").trim() || join(homedir(), ".codex");
}

function resolveExecutable(envKeys, command) {
  for (const key of envKeys) {
    const value = String(process.env[key] || "").trim();
    if (value && canExecute(value)) return value;
  }
  for (const dir of String(process.env.PATH || "").split(delimiter)) {
    const candidate = join(dir, command);
    if (canExecute(candidate)) return candidate;
  }
  return "";
}

function canExecute(path) {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
