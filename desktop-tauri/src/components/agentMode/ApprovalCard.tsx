import { useState } from "react";

import type { ApprovalRequest } from "../../agentTypes";
import { relativeTime } from "../../lib/relativeTime";
import { useAgentWorkStore } from "../../state/agentWorkStore";

/**
 * One decision.
 *
 * The card shows the exact effect — the command, the path, the body — not a
 * summary the agent wrote about itself, because the summary is the part an
 * injected prompt would control. It is set in the terminal's own type on the
 * terminal's own ground for the same reason: this is the machine's text, and
 * it should not be able to impersonate Vibyra's.
 *
 * Approving sends back the fingerprint the card was raised with: if the action
 * has moved since, nothing is authorised and the card reads invalidated rather
 * than quietly doing something else.
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
  const [busy, setBusy] = useState(false);

  const answer = async (approved: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      await resolve(request.id, approved, request.fingerprint);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={`approval approval--${request.risk}`}>
      <header className="approval__head">
        <span className="approval__risk">{request.risk}</span>
        <span className="approval__who">{request.agentName || "An agent"}</span>
        <span className="approval__verb">{RISK_WORDS[request.risk]}</span>
        <span className="approval__target" title={request.target}>
          {request.target || request.action}
        </span>
        <span className="approval__when">{relativeTime(request.createdMs)}</span>
      </header>

      {request.detail && <pre className="approval__detail">{request.detail}</pre>}

      <div className="approval__foot">
        <p className="approval__note">
          {request.costUsd !== null && (
            <span className="approval__cost">This costs ${request.costUsd.toFixed(2)}. </span>
          )}
          {request.trustable
            ? "Approving lets this agent do the same again in the same place."
            : "This one is asked every time — an answer now does not cover the next one."}
        </p>
        <div className="approval__actions">
          <button
            className="btn btn--sm btn--secondary"
            disabled={busy}
            onClick={() => void answer(false)}
          >
            Deny
          </button>
          <button
            className="btn btn--sm btn--primary"
            disabled={busy}
            onClick={() => void answer(true)}
          >
            Approve
          </button>
        </div>
      </div>
    </article>
  );
}
