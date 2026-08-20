// Maps a catalog model onto the CLI that runs it, mirroring the old app's
// launch rules: native CLIs get "--model <bare-id>" (company prefix
// stripped); everything else runs through an OpenRouter-capable CLI with
// the full "openrouter/<slug>" model id.

import type { CatalogModel } from "./openRouterCatalog";
import type { ResolvedAgent } from "../types";
import { nativeAccountModelSupported } from "./modelArtworkData.ts";

interface NativeRunner {
  company: string;
  agentId: string;
  strip: RegExp;
  /** Anthropic ids use dashes ("claude-opus-4-8"); OpenRouter slugs use dots. */
  bareId?: (id: string) => string;
}

const NATIVE_RUNNERS: NativeRunner[] = [
  { company: "Anthropic", agentId: "claude", strip: /^anthropic\//, bareId: (id) => id.replace(/\./g, "-") },
  { company: "OpenAI", agentId: "codex", strip: /^openai\// },
  { company: "Google", agentId: "gemini", strip: /^google\// },
  { company: "Qwen", agentId: "qwen", strip: /^(?:qwen|alibaba)\// },
];

const OPENROUTER_RUNNERS = ["aider", "opencode"];
const ACCOUNT_RUNNERS = new Set(["codex", "claude", "gemini"]);

export const MODEL_RUNNER_IDS = ["codex", "claude", "gemini", "qwen", ...OPENROUTER_RUNNERS];

export interface RunnerPlan {
  runner: ResolvedAgent | null;
  launchModel: string | null;
  /** Honest reason the model can't launch; empty when it can. */
  blocked: string;
}

export function planRunner(
  model: CatalogModel,
  agents: ResolvedAgent[],
  enabledAgentIds: string[],
): RunnerPlan {
  const native = NATIVE_RUNNERS.find((n) => n.company === model.company);
  const nativeSupported = native && (
    !ACCOUNT_RUNNERS.has(native.agentId) || nativeAccountModelSupported(model.company, model.id)
  );
  if (native && nativeSupported) {
    const runner = agents.find((a) => a.id === native.agentId) ?? null;
    if (!enabledAgentIds.includes(native.agentId)) {
      return {
        runner: null,
        launchModel: null,
        blocked: `Enable ${runner?.name ?? native.agentId} in Settings → Integrations`,
      };
    }
    if (!runner?.installed) {
      return {
        runner: null,
        launchModel: null,
        blocked: `Install the "${runner?.program ?? native.agentId}" CLI to run ${model.label}`,
      };
    }
    const bare = model.id.replace(native.strip, "");
    return { runner, launchModel: native.bareId ? native.bareId(bare) : bare, blocked: "" };
  }
  const selected = OPENROUTER_RUNNERS.filter((id) => enabledAgentIds.includes(id));
  const runner = selected.map((id) => agents.find((a) => a.id === id)).find((a) => a?.installed);
  if (!runner) {
    return {
      runner: null,
      launchModel: null,
      blocked: selected.length
        ? "Install the selected OpenRouter-capable CLI to run this model"
        : "Enable Aider or OpenCode in Settings → Integrations",
    };
  }
  return { runner, launchModel: `openrouter/${model.id}`, blocked: "" };
}
