import type { AgentProfile } from "../../agentTypes";
import { useAgentChatStore } from "../../state/agentChatStore";
import { useAgentModeStore } from "../../state/agentModeStore";
import { AgentMark } from "../common/AgentMark";
import { engineLabel } from "../../lib/agentEngineLabel";

/**
 * One teammate in the rail.
 *
 * The dot is the only status here, and it means one thing: this agent is
 * working right now — including a turn *it* started. `running` only records
 * turns this window sent, so a routine firing on the scheduler's thread left
 * the dot dark on the one occasion it mattered most; the chat's own persisted
 * state is what covers both. Deliberately not a count of chats, unread
 * anything, or a "last active" — the rail is a list of people to talk to.
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
        className={`roster-row ${selected ? "is-on" : ""}`}
        aria-current={selected}
        onClick={() => selectAgent(agent.id)}
      >
        <AgentMark
          agentId={agent.engine}
          name={agent.name}
          accent={agent.accent || "var(--accent)"}
          size={22}
        />
        <span className="roster-row__text">
          <span className="roster-row__name">{agent.name}</span>
          <span className="roster-row__engine">{engineLabel(agent.engine)}</span>
        </span>
        {working && (
          <span className="roster-row__working" title="Working now">
            <span className="adot adot--working" />
          </span>
        )}
      </button>
    </li>
  );
}
