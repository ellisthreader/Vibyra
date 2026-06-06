import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const storePath = join(homedir(), ".vibyra-agent", "provider-accounts.json");
const OPENAI_API_URL = "https://api.openai.com/v1";

export function providerAccountsState() {
  return {
    openai: publicOpenAiAccount()
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

export function openAiAccountCredential() {
  const stored = readStore().openai;
  if (stored?.apiKey) {
    return {
      apiKey: String(stored.apiKey),
      organization: String(stored.organization || ""),
      project: String(stored.project || ""),
      source: "local"
    };
  }
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) return null;
  return {
    apiKey,
    organization: String(process.env.OPENAI_ORG_ID || process.env.OPENAI_ORGANIZATION || ""),
    project: String(process.env.OPENAI_PROJECT || ""),
    source: "env"
  };
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
    if (!existsSync(storePath)) return {};
    const parsed = JSON.parse(readFileSync(storePath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  const storeDir = join(homedir(), ".vibyra-agent");
  mkdirSync(storeDir, { recursive: true, mode: 0o700 });
  try { chmodSync(storeDir, 0o700); } catch {}
  writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  try { chmodSync(storePath, 0o600); } catch {}
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
