import { useEffect } from "react";

import { relativeTime } from "../../lib/relativeTime";
import { ClockIcon, ShieldIcon } from "../common/AgentIcons";
import { GaugeIcon, PlusIcon, UserIcon } from "../common/Icons";
import { useAgentModeStore } from "../../state/agentModeStore";
import { useAgentRosterStore } from "../../state/agentRosterStore";
import { useAgentWorkStore } from "../../state/agentWorkStore";
import { ApprovalCard } from "./ApprovalCard";
import { ChatSearch } from "./ChatSearch";
import { DashboardStats } from "./DashboardStats";
import { EmptyState } from "./EmptyState";
import { PanelHead } from "./PanelHead";
import { WorkingNow } from "./WorkingNow";

/**
 * The first screen, and an operational one.
 *
 * What is on it: what needs a person, what is running, what is next. The four
 * figures at the top are the exception to this screen's own rule against
 * counts — each one is a link to the queue behind it, so it is a way in rather
 * than a number to admire. Nothing on it animates: it sits beside live
 * terminals, where every moving element costs the renderer something.
 */
export function AgentDashboard({ onNewAgent }: { onNewAgent: () => void }) {
  const approvals = useAgentWorkStore((state) => state.approvals);
  const routines = useAgentWorkStore((state) => state.routines);
  const loadApprovals = useAgentWorkStore((state) => state.loadApprovals);
  const loadRoutines = useAgentWorkStore((state) => state.loadRoutines);
  const agents = useAgentRosterStore((state) => state.agents);
  const openPanel = useAgentModeStore((state) => state.openPanel);

  useEffect(() => {
    void loadApprovals();
    void loadRoutines(null);
  }, [loadApprovals, loadRoutines]);

  const upcoming = routines
    .filter((routine) => routine.enabled && routine.nextRunMs)
    .sort((left, right) => (left.nextRunMs ?? 0) - (right.nextRunMs ?? 0))
    .slice(0, 4);

  if (agents.length === 0) {
    return (
      <div className="panel">
        <div className="panel__inner">
          <PanelHead
            title="Agent"
            blurb="A teammate is a persistent agent with its own brief, memory, skills and folders. Every chat you have with it shares them."
          />
          <EmptyState
            icon={<UserIcon size={18} />}
            title="No teammates yet"
            body="Create one and it keeps a brief you write once, learns between conversations, and can be given folders, skills and a schedule."
            action={
              <button className="btn btn--primary" onClick={onNewAgent}>
                <PlusIcon size={13} /> New teammate
              </button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel__inner">
        <PanelHead
          title="Agent"
          blurb="What needs you, what is running, and what happens next."
          actions={
            <button className="btn btn--sm" onClick={onNewAgent}>
              <PlusIcon size={13} /> New teammate
            </button>
          }
        />

        <ChatSearch />
        <DashboardStats />

        <section className="panel__section">
          <div className="panel__section-head">
            <span className="section-label">Waiting for you</span>
            {approvals.length > 0 && (
              <span className="panel__count panel__count--ask">{approvals.length}</span>
            )}
          </div>
          {approvals.length === 0 ? (
            <EmptyState
              compact
              icon={<ShieldIcon size={16} />}
              title="Nothing needs a decision"
              body="Publishing, spending, deleting outside a granted folder and anything touching a secret stop here first."
            />
          ) : (
            <div className="panel__cards">
              {approvals.slice(0, 3).map((request) => (
                <ApprovalCard key={request.id} request={request} />
              ))}
              {approvals.length > 3 && (
                <button className="btn btn--sm" onClick={() => openPanel("decisions")}>
                  {approvals.length - 3} more waiting
                </button>
              )}
            </div>
          )}
        </section>

        <section className="panel__section">
          <span className="section-label">Working now</span>
          <WorkingNow />
        </section>

        <section className="panel__section">
          <div className="panel__section-head">
            <span className="section-label">Next scheduled</span>
            <button className="btn btn--sm" onClick={() => openPanel("routines")}>
              <ClockIcon size={12} /> Routines
            </button>
          </div>
          {upcoming.length === 0 ? (
            <EmptyState
              compact
              icon={<GaugeIcon size={16} />}
              title="Nothing is scheduled"
              body="A routine opens a fresh chat on a clock. They run while Vibyra is open."
            />
          ) : (
            <ul className="rows">
              {upcoming.map((routine) => (
                <li key={routine.id}>
                  <button className="row" onClick={() => openPanel("routines")}>
                    <span className="row__text">
                      <span className="row__title">
                        <span>{routine.name}</span>
                      </span>
                      <span className="row__meta">{routine.description}</span>
                    </span>
                    <span className="row__when">
                      {routine.nextRunMs ? relativeTime(routine.nextRunMs) : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
