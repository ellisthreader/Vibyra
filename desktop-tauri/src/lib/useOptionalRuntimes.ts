import { useEffect } from "react";

import { isAccountRuntime } from "./providerAccountPolicy";
import { useAgentStore } from "../state/agentStore";
import type { ResolvedAgent } from "../types";

/** Never offered as an agent to add: these are how you open a plain terminal,
 * not something with a CLI to install or an account to sign into. */
const NOT_AGENTS = new Set(["shell", "ssh"]);

/**
 * Every agent Vibyra can launch that is not one of the company accounts.
 *
 * Derived from the resolved catalog itself (`agents/catalog.rs`), not from a
 * list kept alongside it: the one rule that matters here is that nothing can
 * be offered which Vibyra cannot actually run, and the only way to guarantee
 * that is to ask the thing that runs them.
 *
 * Order is catalog order, deliberately stable — rows must not reshuffle under
 * the pointer as an install lands.
 */
export function useOptionalRuntimes(mode: "installed" | "missing" | "all"): ResolvedAgent[] {
  const agents = useAgentStore((state) => state.agents);
  const refresh = useAgentStore((state) => state.refresh);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return agents
    .filter((agent) => !agent.custom && !NOT_AGENTS.has(agent.id) && !isAccountRuntime(agent.id))
    .filter((agent) => (mode === "all" ? true : mode === "installed" ? agent.installed : !agent.installed));
}
