import { useEffect } from "react";

import { useAgentWorkStore } from "../../state/agentWorkStore";
import { ApprovalCard } from "./ApprovalCard";

/**
 * Every decision waiting.
 *
 * Polled rather than pushed: a card can be raised by a routine running
 * unattended on the scheduler's thread, where no channel is open, and a
 * ten-second poll of an indexed query is cheaper than the plumbing to push.
 * A decision that appears ten seconds late is still a decision that waits.
 */
export function DecisionsPanel() {
  const approvals = useAgentWorkStore((state) => state.approvals);
  const error = useAgentWorkStore((state) => state.error);
  const load = useAgentWorkStore((state) => state.loadApprovals);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(timer);
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
