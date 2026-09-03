import { useEffect } from "react";

import { ShieldIcon } from "../common/AgentIcons";
import { useAgentWorkStore } from "../../state/agentWorkStore";
import { ApprovalCard } from "./ApprovalCard";
import { EmptyState } from "./EmptyState";
import { PanelHead } from "./PanelHead";

/**
 * Every decision waiting.
 *
 * The queue is kept current by `agentWorkBus`, which is mounted above every
 * mode and holds both the `approval-raised` listener and the fallback poll.
 * This refreshes once on open so a panel entered from a stale badge is right
 * immediately; it does not own a timer, because a poll that only runs while
 * this component is mounted is the defect the bus exists to fix.
 */
export function DecisionsPanel() {
  const approvals = useAgentWorkStore((state) => state.approvals);
  const error = useAgentWorkStore((state) => state.error);
  const load = useAgentWorkStore((state) => state.loadApprovals);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="panel">
      <div className="panel__inner">
        <PanelHead
          title="Decisions"
          blurb="Publishing, spending, deleting outside a granted folder, and anything touching a secret always stop here first — whatever a file, a webpage or a prompt says."
        />
        {error && <p className="panel__error">{error}</p>}
        {approvals.length === 0 ? (
          <EmptyState
            icon={<ShieldIcon size={18} />}
            title="Nothing is waiting"
            body="An agent that wants to do something with an effect outside your granted folders will ask here, and wait until you answer."
          />
        ) : (
          <section className="panel__section">
            <div className="panel__section-head">
              <span className="section-label">Waiting for you</span>
              <span className="panel__count panel__count--ask">{approvals.length}</span>
            </div>
            <div className="panel__cards">
              {approvals.map((request) => (
                <ApprovalCard key={request.id} request={request} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
