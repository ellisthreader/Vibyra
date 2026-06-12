import { readFileSync } from "node:fs";
import { openRouterConfigPaths, parseEnvConfigValue } from "./agentConfig.mjs";
import {
  cancelProviderAccountLogin,
  disconnectProviderAccount,
  providerAccountAuthState,
  startProviderAccountLogin
} from "./providerAccountAuth.mjs";

export function providerAccountsState() {
  return {
    codex: providerAccountAuthState("codex"),
    claude: providerAccountAuthState("claude"),
    gemini: providerAccountAuthState("gemini")
  };
}

export function connectProviderAccount(provider) {
  return startProviderAccountLogin(provider);
}

export function cancelProviderAccountConnection(provider) {
  return cancelProviderAccountLogin(provider);
}

export function disconnectConnectedProviderAccount(provider) {
  return disconnectProviderAccount(provider);
}

export function openAiVoiceCredential({
  env = process.env,
  configPaths = openRouterConfigPaths()
} = {}) {
  const processApiKey = String(env.OPENAI_API_KEY || "").trim();
  if (processApiKey) {
    return {
      apiKey: processApiKey,
      organization: String(env.OPENAI_ORG_ID || env.OPENAI_ORGANIZATION || "").trim(),
      project: String(env.OPENAI_PROJECT || "").trim(),
      source: "env"
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
      project: parseEnvConfigValue(body, "OPENAI_PROJECT"),
      source: "env"
    };
  }
  return null;
}

export function openAiHeaders(credential) {
  if (!credential?.apiKey) return null;
  return {
    Authorization: `Bearer ${credential.apiKey}`,
    ...(credential.organization ? { "OpenAI-Organization": credential.organization } : {}),
    ...(credential.project ? { "OpenAI-Project": credential.project } : {})
  };
}
