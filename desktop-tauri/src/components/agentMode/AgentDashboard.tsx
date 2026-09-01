import { useEffect } from "react";

import { relativeTime } from "../../lib/relativeTime";
import { useAgentModeStore } from "../../state/agentModeStore";
import { useAgentRosterStore } from "../../state/agentRosterStore";
import { useAgentWorkStore } from "../../state/agentWorkStore";
import { ApprovalCard } from "./ApprovalCard";
import { ChatSearch } from "./ChatSearch";
import { WorkingNow } from "./WorkingNow";

/**
 * The first screen, and an operational one.
 *
 * What is on it: what needs a person, what is running, what failed, what is
 * next. What is deliberately not on it: counts of agents, chats or tokens.
 * A number that never demands an action is a number nobody reads twice, and
 * this screen sits beside live terminals where every animated element costs
 * the renderer something.
 */
export function AgentDashboard() {
  const approvals = useAgentWorkStore((state) => state.approvals);
  const routines = useAgentWorkStore((state) => state.routines);
  const loadApprovals = useAgentWorkStore((state) => state.loadApprovals);
  const loadRoutines = useAgentWorkStore((state) => state.loadRoutines);
  const agents = useAgentRosterStore((state) => state.agents);
  const selectAgent = useAgentModeStore((state) => state.selectAgent);
  const openPanel = useAgentModeStore((state) => state.openPanel);

  useEffect(() => {
    void loadApprovals();
    void loadRoutines(null);
  }, [loadApprovals, loadRoutines]);

  const upcoming = routines
    .filter((routine) => routine.enabled && routine.nextRunMs)
    .sort((left, right) => (left.nextRunMs ?? 0) - (right.nextRunMs ?? 0))
    .slice(0, 4);

  return (
    <div className="dashboard">
      <ChatSearch />
      <section className="dashboard__block">
        <h3 className="section-label">Waiting for you</h3>
        {approvals.length === 0 ? (
          <p className="dashboard__quiet">Nothing needs a decision.</p>
        ) : (
          <div className="dashboard__cards">
            {approvals.slice(0, 3).map((request) => (
              <ApprovalCard key={request.id} request={request} />
            ))}
            {approvals.length > 3 && (
              <button className="dashboard__more" onClick={() => openPanel("decisions")}>
                {approvals.length - 3} more waiting
              </button>
            )}
          </div>
        )}
      </section>

      <section className="dashboard__block">
        <h3 className="section-label">Working now</h3>
        <WorkingNow />
      </section>

      <section className="dashboard__block">
        <h3 className="section-label">Next scheduled</h3>
        {upcoming.length === 0 ? (
          <p className="dashboard__quiet">
            No routines scheduled. Routines run while Vibyra is open.
          </p>
        ) : (
          <ul className="dashboard__list">
            {upcoming.map((routine) => (
              <li key={routine.id}>
                <button onClick={() => openPanel("routines")}>
                  <span>{routine.name}</span>
                  <span className="dashboard__when">
                    {routine.nextRunMs ? relativeTime(routine.nextRunMs) : routine.description}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {agents.length > 0 && (
        <section className="dashboard__block">
          <h3 className="section-label">Teammates</h3>
          <ul className="dashboard__chips">
            {agents.map((agent) => (
              <li key={agent.id}>
                <button onClick={() => selectAgent(agent.id)}>{agent.name}</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
