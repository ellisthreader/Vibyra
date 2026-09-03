import { relativeTime } from "../../lib/relativeTime";
import { useAgentChatStore } from "../../state/agentChatStore";
import { useAgentModeStore } from "../../state/agentModeStore";
import { useAgentRosterStore } from "../../state/agentRosterStore";
import { useAgentWorkStore } from "../../state/agentWorkStore";

/**
 * Four figures, each a way into the queue behind it.
 *
 * The dashboard's rule is that a number which never demands an action is a
 * number nobody reads twice — so every tile here is either pressable or says
 * something a person would act on. "Last checked" is the exception that earns
 * its place: it is the answer to "is the scheduler actually running?", which
 * is otherwise invisible until something fails to happen.
 */
export function DashboardStats() {
  const approvals = useAgentWorkStore((state) => state.approvals);
  const routines = useAgentWorkStore((state) => state.routines);
  const lastCheckedMs = useAgentWorkStore((state) => state.lastCheckedMs);
  const agents = useAgentRosterStore((state) => state.agents);
  const openPanel = useAgentModeStore((state) => state.openPanel);
  const running = useAgentChatStore((state) => {
    let live = 0;
    for (const list of Object.values(state.chats)) {
      for (const chat of list) {
        if (state.running[chat.id] || chat.state === "running") live += 1;
      }
    }
    return live;
  });

  const scheduled = routines.filter((routine) => routine.enabled).length;

  return (
    <div className="stats">
      <button className="stat" onClick={() => openPanel("decisions")}>
        <span className="stat__label">Waiting</span>
        <span className={`stat__value ${approvals.length > 0 ? "stat__value--ask" : ""}`}>
          {approvals.length}
        </span>
        <span className="stat__hint">
          {approvals.length === 0 ? "Nothing to decide" : "Needs your answer"}
        </span>
      </button>

      <div className="stat">
        <span className="stat__label">Running</span>
        <span className={`stat__value ${running > 0 ? "stat__value--live" : ""}`}>{running}</span>
        <span className="stat__hint">{running === 0 ? "Idle" : "Turns in flight"}</span>
      </div>

      <button className="stat" onClick={() => openPanel("routines")}>
        <span className="stat__label">Scheduled</span>
        <span className="stat__value">{scheduled}</span>
        <span className="stat__hint">
          {lastCheckedMs ? `Checked ${relativeTime(lastCheckedMs)}` : "Checked every minute"}
        </span>
      </button>

      <div className="stat">
        <span className="stat__label">Teammates</span>
        <span className="stat__value">{agents.length}</span>
        <span className="stat__hint">
          {agents.length === 1 ? agents[0].name : "Each with its own memory"}
        </span>
      </div>
    </div>
  );
}
