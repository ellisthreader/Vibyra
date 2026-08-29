import type { ApprovalRequest } from "../../agentTypes";
import { useAgentWorkStore } from "../../state/agentWorkStore";

/**
 * One decision.
 *
 * The card shows the exact effect, not a summary the agent wrote about itself,
 * because the summary is the part an injected prompt would control. Approving
 * sends back the fingerprint the card was raised with: if the action has moved
 * since, nothing is authorised and the card reads invalidated rather than
 * quietly doing something else.
 */
const RISK_WORDS: Record<ApprovalRequest["risk"], string> = {
  read: "reads",
  write: "writes to",
  destructive: "deletes",
  spend: "spends money on",
  publish: "publishes to",
  secret: "reveals",
};

export function ApprovalCard({ request }: { request: ApprovalRequest }) {
  const resolve = useAgentWorkStore((state) => state.resolveApproval);

  return (
    <article className={`approval approval--${request.risk}`}>
      <header className="approval__head">
        <span className="approval__who">{request.agentName || "An agent"}</span>
        <span className="approval__verb">{RISK_WORDS[request.risk]}</span>
        <span className="approval__target">{request.target || request.action}</span>
      </header>
      <p className="approval__detail">{request.detail}</p>
      {request.costUsd !== null && (
        <p className="approval__cost">This costs ${request.costUsd.toFixed(2)}.</p>
      )}
      {!request.trustable && (
        <p className="approval__once">
          This one is asked every time — an answer now does not cover the next one.
        </p>
      )}
      <div className="approval__actions">
        <button
          className="btn-primary"
          onClick={() => void resolve(request.id, true, request.fingerprint)}
        >
          Approve
        </button>
        <button
          className="btn-ghost"
          onClick={() => void resolve(request.id, false, request.fingerprint)}
        >
          Deny
        </button>
      </div>
    </article>
  );
}
