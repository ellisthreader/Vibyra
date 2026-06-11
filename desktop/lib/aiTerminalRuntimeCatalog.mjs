import { fileURLToPath } from "node:url";

export const VIBYRA_AGENT_ENTRY_PATH = fileURLToPath(
  new URL("./aiTerminalOpenRouterCli.mjs", import.meta.url)
);

export const TERMINAL_RUNTIMES = {
  "vibyra-agent": {
    id: "vibyra-agent",
    label: "Vibyra Agent",
    executable: "node",
    engineRuntimeId: "codex",
    env: [],
    bundled: true,
    nodeEntry: VIBYRA_AGENT_ENTRY_PATH,
    adapter: {
      id: "responses",
      protocol: "openai-responses",
      ready: true,
      reason: ""
    },
    requirements: { node: ">=20.19.4" },
    installer: { type: "bundled", version: "1" }
  },
  codex: {
    id: "codex",
    label: "Codex CLI",
    executable: "codex",
    env: ["VIBYRA_CODEX_CLI", "CODEX_CLI_PATH"],
    bundled: true,
    adapter: {
      id: "openai-responses",
      protocol: "openai-responses",
      ready: true,
      reason: ""
    },
    requirements: {},
    installer: { type: "npm", package: "@openai/codex", version: "0.138.0" }
  },
  claude: {
    id: "claude",
    label: "Claude Code",
    executable: "claude",
    env: ["VIBYRA_CLAUDE_CLI", "CLAUDE_CLI_PATH"],
    adapter: {
      id: "anthropic-messages",
      protocol: "anthropic-messages",
      ready: true,
      reason: ""
    },
    requirements: {},
    installer: { type: "npm", package: "@anthropic-ai/claude-code", version: "2.1.169" }
  },
  gemini: {
    id: "gemini",
    label: "Gemini CLI",
    executable: "gemini",
    env: ["VIBYRA_GEMINI_CLI", "GEMINI_CLI_PATH"],
    adapter: {
      id: "gemini-generate-content",
      protocol: "gemini-generate-content",
      ready: true,
      reason: ""
    },
    requirements: {},
    installer: { type: "npm", package: "@google/gemini-cli", version: "0.45.2" }
  },
  qwen: {
    id: "qwen",
    label: "Qwen Code",
    executable: "qwen",
    env: ["VIBYRA_QWEN_CLI", "QWEN_CLI_PATH"],
    adapter: {
      id: "openai-chat-completions",
      protocol: "openai-chat-completions",
      ready: true,
      reason: ""
    },
    requirements: { node: ">=22" },
    installer: {
      type: "npm",
      package: "@qwen-code/qwen-code",
      version: "0.17.1",
      nodeVersion: "22.19.0"
    }
  },
  kimi: {
    id: "kimi",
    label: "Kimi Code",
    executable: "kimi",
    env: ["VIBYRA_KIMI_CLI", "KIMI_CLI_PATH"],
    adapter: {
      id: "openai-responses",
      protocol: "openai-responses",
      ready: true,
      reason: ""
    },
    requirements: { node: ">=22" },
    installer: {
      type: "npm",
      package: "@moonshot-ai/kimi-code",
      version: "0.14.0",
      nodeVersion: "22.19.0"
    }
  },
  mistral: {
    id: "mistral",
    label: "Mistral Vibe",
    executable: "vibe",
    env: ["VIBYRA_MISTRAL_CLI", "MISTRAL_VIBE_PATH"],
    adapter: {
      id: "openai-responses",
      protocol: "openai-responses",
      ready: true,
      reason: ""
    },
    requirements: { python: ">=3.12" },
    installer: { type: "python", package: "mistral-vibe", version: "2.14.1" }
  },
  grok: {
    id: "grok",
    label: "Grok Build",
    executable: "grok",
    env: ["VIBYRA_GROK_CLI", "GROK_CLI_PATH"],
    adapter: {
      id: "openai-chat-completions",
      protocol: "openai-chat-completions",
      ready: true,
      reason: ""
    },
    requirements: {},
    installer: {
      type: "xai",
      version: "0.2.39",
      url: "https://x.ai/cli/install.sh"
    }
  }
};

export const TERMINAL_PROVIDER_RUNTIMES = new Map([
  ["openai", "codex"],
  ["anthropic", "claude"],
  ["claude", "claude"],
  ["google", "gemini"],
  ["gemini", "gemini"],
  ["qwen", "qwen"],
  ["alibaba", "qwen"],
  ["mistral", "mistral"],
  ["mistralai", "mistral"],
  ["moonshot", "kimi"],
  ["moonshotai", "kimi"],
  ["kimi", "kimi"],
  ["x-ai", "grok"],
  ["xai", "grok"]
]);
