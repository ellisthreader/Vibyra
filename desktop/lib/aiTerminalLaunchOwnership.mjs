import { VIBYRA_AGENT_ENTRY_PATH } from "./aiTerminalRuntimeCatalog.mjs";

export function assertAiTerminalLaunchOwnership(status, args = []) {
  if (status?.key !== "vibyra") return;

  const launchesVibyraAgent = status.runtimeId === "vibyra-agent"
    && status.launchMode === "vibyra-agent"
    && status.commandPath === process.execPath
    && args.length === 1
    && args[0] === VIBYRA_AGENT_ENTRY_PATH;
  if (launchesVibyraAgent) return;

  if (["claude", "gemini", "qwen", "kimi", "mistral", "grok"].includes(status.runtimeId)
    && Boolean(status.commandPath)
    && status.commandPath === status.agentEnginePath
    && !args.includes("exec")) {
    return;
  }

  const launchesManagedCodex = status.runtimeId === "codex"
    && Boolean(status.commandPath)
    && status.commandPath === status.agentEnginePath;
  const launchesInteractiveVibyraProvider = args.includes('model_provider="vibyra"')
    && args.includes("--no-alt-screen")
    && !args.includes("exec");

  if (!launchesManagedCodex || !launchesInteractiveVibyraProvider) {
    throw new Error(
      "Blocked invalid Vibyra terminal launch: the selected native provider must own the interactive PTY."
    );
  }
}
