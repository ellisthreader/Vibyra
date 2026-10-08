import { useCallback, useEffect, useRef, useState } from "react";

import { agentInstalls, clearAgentInstall, installAgentCli, refreshAgents } from "../ipc/agentInstall";
import type { AgentInstall } from "../ipc/agentInstall";
import { useAgentStore } from "../state/agentStore";

/** Slow enough not to matter next to a minutes-long npm install, fast enough
 * that a finished one does not feel stuck. */
const POLL_MS = 1_500;

/**
 * Installing an agent's CLI, and knowing when it landed.
 *
 * Rust returns as soon as npm is running, so the outcome has to be watched
 * for: the command appearing on PATH is success, and `agent_installs` holding
 * an error is failure. Without the second half a failed install would sit on
 * "Installing…" forever, waiting for a program that is never going to exist.
 */
export function useAgentInstalls() {
  const setAgents = useAgentStore((state) => state.setAgents);
  const [state, setState] = useState<Record<string, AgentInstall>>({});
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const busy = Object.values(state).some((entry) => entry.running);

  const poll = useCallback(async () => {
    const [installs, agents] = await Promise.all([
      agentInstalls().catch(() => ({}) as Record<string, AgentInstall>),
      refreshAgents().catch(() => null),
    ]);
    if (agents) setAgents(agents);
    setState(installs);
  }, [setAgents]);

  useEffect(() => {
    if (!busy) return;
    timer.current = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(timer.current);
  }, [busy, poll]);

  useEffect(() => () => clearInterval(timer.current), []);

  const install = useCallback(
    async (agent: string) => {
      setState((current) => ({ ...current, [agent]: { running: true, error: null } }));
      try {
        await installAgentCli(agent);
      } catch (error) {
        // A refusal from Rust — no npm, or an agent it will not install — is
        // the same shape as a failed install as far as the row is concerned.
        setState((current) => ({
          ...current,
          [agent]: { running: false, error: String(error) },
        }));
        return;
      }
      await poll();
    },
    [poll],
  );

  const dismiss = useCallback((agent: string) => {
    void clearAgentInstall(agent).catch(() => {});
    setState((current) => {
      const next = { ...current };
      delete next[agent];
      return next;
    });
  }, []);

  return { state, install, dismiss };
}
