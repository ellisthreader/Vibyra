import type { AgentProfile } from "../../agentTypes";
import { useAgentChatStore } from "../../state/agentChatStore";
import { useAgentModeStore } from "../../state/agentModeStore";
import { AgentMark } from "../common/AgentMark";

/**
 * One teammate in the rail.
 *
 * The dot is the only status here, and it means one thing: this agent is
 * working right now — including a turn *it* started. `running` only records
 * turns this window sent, so a routine firing on the scheduler's thread left
 * the dot dark on the one occasion it mattered most; the chat's own persisted
 * state is what covers both. Deliberately not a count of chats, unread anything, or a
 * "last active" — the rail is a list of people to talk to, and every extra
 * number on a row is one more thing to read before choosing.
 */
export function AgentRosterRow({
  agent,
  selected,
}: {
  agent: AgentProfile;
  selected: boolean;
}) {
  const selectAgent = useAgentModeStore((state) => state.selectAgent);
  const working = useAgentChatStore((state) => {
    const chats = state.chats[agent.id] ?? [];
    return chats.some((chat) => state.running[chat.id] || chat.state === "running");
  });

  return (
    <li>
      <button
        className={`agent-row ${selected ? "is-on" : ""}`}
        aria-current={selected}
        onClick={() => selectAgent(agent.id)}
      >
        <AgentMark
          agentId={agent.engine}
          name={agent.name}
          accent={agent.accent || "var(--accent)"}
          size={20}
        />
        <span className="agent-row__name">{agent.name}</span>
        {working && (
          <span className="agent-row__working" title="Working now">
            <span className="activity-dot" />
          </span>
        )}
      </button>
    </li>
  );
}
