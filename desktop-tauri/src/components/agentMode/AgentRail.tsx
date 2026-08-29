import { BookIcon, ClockIcon, ShieldIcon } from "../common/AgentIcons";
import { GaugeIcon, PlusIcon } from "../common/Icons";
import { useAgentModeStore } from "../../state/agentModeStore";
import { useAgentRosterStore } from "../../state/agentRosterStore";
import { useAgentWorkStore } from "../../state/agentWorkStore";
import { AgentRosterRow } from "./AgentRosterRow";

/**
 * The primary rail: the panels, then the teammates, then one way to add one.
 *
 * Panels first because they are where attention goes — a decision waiting is
 * more urgent than any particular agent — and the roster below because that is
 * the list that grows. New Agent sits at the bottom of the roster rather than
 * in a header, where it would compete with the section label for the same eye.
 */
const PANELS = [
  { id: "dashboard", label: "Dashboard", Icon: GaugeIcon },
  { id: "decisions", label: "Decisions", Icon: ShieldIcon },
  { id: "routines", label: "Routines", Icon: ClockIcon },
  { id: "skills", label: "Skills", Icon: BookIcon },
] as const;

export function AgentRail({ onNewAgent }: { onNewAgent: () => void }) {
  const agents = useAgentRosterStore((state) => state.agents);
  const panel = useAgentModeStore((state) => state.panel);
  const agentId = useAgentModeStore((state) => state.agentId);
  const openPanel = useAgentModeStore((state) => state.openPanel);
  const waiting = useAgentWorkStore((state) => state.approvals.length);

  return (
    <aside className="rail agent-rail">
      <div className="rail__scroll">
        <div className="rail__section">
          <nav className="agent-rail__panels">
            {PANELS.map(({ id, label, Icon }) => (
              <button
                key={id}
                className={`agent-rail__panel ${panel === id ? "is-on" : ""}`}
                aria-current={panel === id}
                onClick={() => openPanel(id)}
              >
                <Icon size={14} />
                <span>{label}</span>
                {id === "decisions" && waiting > 0 && (
                  <span className="agent-rail__count" aria-label={`${waiting} waiting`}>
                    {waiting}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="rail__section">
          <div className="rail__section-head">
            <span className="section-label">Teammates</span>
          </div>
          {agents.length === 0 ? (
            <p className="agent-rail__empty">
              No teammates yet. An agent keeps a brief, its own memory and its own chats.
            </p>
          ) : (
            <ul className="agent-rail__roster">
              {agents.map((agent) => (
                <AgentRosterRow key={agent.id} agent={agent} selected={agent.id === agentId} />
              ))}
            </ul>
          )}
          <button className="agent-rail__new" onClick={onNewAgent}>
            <PlusIcon size={13} /> New agent
          </button>
        </div>
      </div>
    </aside>
  );
}
