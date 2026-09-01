import { useEffect } from "react";

import { useAgentWorkStore } from "../../state/agentWorkStore";
import { ApprovalCard } from "./ApprovalCard";

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
      <header className="panel__head">
        <h2>Decisions</h2>
        <p>
          Publishing, spending, deleting outside a granted folder, and anything touching a
          secret always stop here first — whatever a file, a webpage or a prompt says.
        </p>
      </header>
      {error && <p className="panel__error">{error}</p>}
      {approvals.length === 0 ? (
        <p className="panel__quiet">Nothing is waiting.</p>
      ) : (
        <div className="panel__cards">
          {approvals.map((request) => (
            <ApprovalCard key={request.id} request={request} />
          ))}
        </div>
      )}
    </div>
  );
}
