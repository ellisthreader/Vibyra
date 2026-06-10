export const AI_TERMINAL_LAUNCH_CONTRACT_VERSION = 8;

const PROVIDER_DEFINITIONS = [
  {
    providerId: "openai",
    aliases: ["openai"],
    runtimeId: "codex",
    adapterId: "responses",
    protocol: "openai-responses",
    managedCreditsReady: true,
    personalAccountReady: true,
    modelPrefixes: ["gpt-", "codex"]
  },
  {
    providerId: "anthropic",
    aliases: ["anthropic", "claude"],
    runtimeId: "claude",
    adapterId: "anthropic-messages",
    protocol: "anthropic-messages",
    managedCreditsReady: true,
    personalAccountReady: true,
    modelPrefixes: ["claude-"]
  },
  {
    providerId: "google",
    aliases: ["google", "gemini"],
    runtimeId: "gemini",
    adapterId: "gemini-generate-content",
    protocol: "gemini-generate-content",
    managedCreditsReady: true,
    personalAccountReady: true,
    modelPrefixes: ["gemini-"]
  },
  {
    providerId: "qwen",
    aliases: ["qwen", "alibaba"],
    runtimeId: "qwen",
    adapterId: "chat-completions",
    protocol: "openai-chat-completions",
    managedCreditsReady: false,
    personalAccountReady: false,
    modelPrefixes: ["qwen-"]
  },
  {
    providerId: "moonshot",
    aliases: ["moonshot", "moonshotai", "kimi"],
    runtimeId: "kimi",
    adapterId: "responses",
    protocol: "openai-responses",
    managedCreditsReady: false,
    personalAccountReady: false,
    modelPrefixes: ["kimi-"]
  },
  {
    providerId: "mistral",
    aliases: ["mistral", "mistralai"],
    runtimeId: "mistral",
    adapterId: "responses",
    protocol: "openai-responses",
    managedCreditsReady: false,
    personalAccountReady: false,
    modelPrefixes: ["mistral-", "codestral-", "devstral-"]
  }
];

export const AI_TERMINAL_PROVIDER_ADAPTERS = deepFreeze(Object.fromEntries(
  PROVIDER_DEFINITIONS.map((definition) => [
    definition.providerId,
    {
      ...definition,
      aliases: [...definition.aliases],
      modelPrefixes: [...definition.modelPrefixes],
      billingModes: [
        ...(definition.managedCreditsReady ? ["vibyra"] : []),
        ...(definition.personalAccountReady ? ["provider"] : [])
      ],
      permissionModes: ["standard", "full"],
      sandboxModes: ["workspace-write", "danger-full-access"]
    }
  ])
));

const PROVIDER_ALIASES = new Map();
for (const definition of Object.values(AI_TERMINAL_PROVIDER_ADAPTERS)) {
  for (const alias of definition.aliases) PROVIDER_ALIASES.set(alias, definition.providerId);
}
const DYNAMIC_PROVIDER_ADAPTERS = new Map();

export function terminalProviderIdForModel(model = "") {
  const value = normalizeModel(model);
  if (!value || value === "auto") return "";
  if (value.includes("/")) {
    const [qualifiedProvider, qualifiedModel] = value.split("/", 2);
    if (!qualifiedProvider || !qualifiedModel) return "";
    return PROVIDER_ALIASES.get(qualifiedProvider) || qualifiedProvider;
  }
  for (const definition of Object.values(AI_TERMINAL_PROVIDER_ADAPTERS)) {
    if (definition.modelPrefixes.some((prefix) => value.startsWith(prefix))) {
      return definition.providerId;
    }
  }
  return "";
}

export function terminalProviderAdapter(providerId = "") {
  const normalizedId = normalizeProvider(providerId);
  const canonicalId = PROVIDER_ALIASES.get(normalizedId) || normalizedId;
  if (!canonicalId) return null;
  return AI_TERMINAL_PROVIDER_ADAPTERS[canonicalId]
    || dynamicProviderAdapter(canonicalId);
}

export function terminalProviderAdapterForModel(model = "") {
  return terminalProviderAdapter(terminalProviderIdForModel(model));
}

export function terminalProviderAdapters() {
  return Object.values(AI_TERMINAL_PROVIDER_ADAPTERS);
}

function normalizeModel(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeProvider(value) {
  const provider = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]*$/.test(provider) ? provider : "";
}

function dynamicProviderAdapter(providerId) {
  if (DYNAMIC_PROVIDER_ADAPTERS.has(providerId)) {
    return DYNAMIC_PROVIDER_ADAPTERS.get(providerId);
  }
  const adapter = deepFreeze({
    providerId,
    aliases: [providerId],
    runtimeId: "vibyra-agent",
    adapterId: "responses",
    protocol: "openai-responses",
    managedCreditsReady: true,
    personalAccountReady: false,
    modelPrefixes: [],
    billingModes: ["vibyra"],
    permissionModes: ["standard", "full"],
    sandboxModes: ["workspace-write", "danger-full-access"]
  });
  DYNAMIC_PROVIDER_ADAPTERS.set(providerId, adapter);
  return adapter;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
