import type { AgentProfile } from "../../agentTypes";
import { useAgentChatStore } from "../../state/agentChatStore";
import { useAgentModeStore } from "../../state/agentModeStore";
import { useAgentRosterStore, capabilityFor } from "../../state/agentRosterStore";
import { AgentMark } from "../common/AgentMark";

/**
 * Name, engine, whether it is working, and the three tabs.
 *
 * The blocker line is the one piece of chrome that earns its space: a CLI too
 * old for structured chat is the difference between "Agent Mode is broken" and
 * "run npm update", and it belongs where the user is about to type rather than
 * buried in Settings.
 */
const TABS = [
  { id: "chats", label: "Chats" },
  { id: "skills", label: "Skills" },
  { id: "settings", label: "Settings" },
] as const;

export function AgentHeader({ agent }: { agent: AgentProfile }) {
  const tab = useAgentModeStore((state) => state.tab);
  const setTab = useAgentModeStore((state) => state.setTab);
  const capability = useAgentRosterStore((state) =>
    capabilityFor(state.capabilities, agent.engine),
  );
  const working = useAgentChatStore((state) => {
    const chats = state.chats[agent.id] ?? [];
    return chats.filter((chat) => state.running[chat.id]).length;
  });

  return (
    <header className="agent-head">
      <div className="agent-head__identity">
        <AgentMark
          agentId={agent.engine}
          name={agent.name}
          accent={agent.accent || "var(--accent)"}
          size={26}
        />
        <div className="agent-head__names">
          <h2>{agent.name}</h2>
          <p>
            {agent.engine === "claude" ? "Claude Code" : "Codex"}
            {capability.version ? ` ${capability.version.split(" ")[0]}` : ""}
            {working > 0 && <span className="agent-head__busy"> · working on {working}</span>}
          </p>
        </div>
        <div className="dock__tabs" role="tablist" aria-label="Agent view">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              className={`dock__tab ${tab === id ? "dock__tab--active" : ""}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {!capability.structured && <p className="agent-head__blocked">{capability.blocker}</p>}
    </header>
  );
}
