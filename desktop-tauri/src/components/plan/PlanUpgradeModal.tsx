import { useState } from "react";

import { accountBillingPage } from "../../ipc/accountBilling";
import type { PlanFeature } from "../../lib/planLimits";
import { usePlanPromptStore } from "../../state/planPromptStore";
import { CheckIcon, CloseIcon, SparklesIcon } from "../common/Icons";
import { useDialogFocus } from "../teammates/useDialogFocus";

const TITLES: Record<PlanFeature, string> = {
  terminals: "Run every agent you need",
  projects: "Build as many projects as you like",
  preview: "See your site while agents build it",
  review: "Check every change before you keep it",
  worktrees: "Give every agent its own copy",
  agents: "Put a team of agents to work",
  cloud: "Reach your computer from anywhere",
};

/** What Pro adds over Free, in the order the pricing page lists it. */
const PRO_ADDS = [
  "Unlimited projects and terminals",
  "Preview and Review",
  "Safe mode worktrees",
];

/** Shown when a native command reports a plan limit. It never blocks work in
 * progress: whatever is already running keeps running. */
export function PlanUpgradeModal() {
  const notice = usePlanPromptStore((state) => state.notice);
  const close = usePlanPromptStore((state) => state.close);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const dialog = useDialogFocus(Boolean(notice), close);
  if (!notice) return null;
  const upgrade = async () => {
    setOpening(true);
    setError("");
    try {
      await accountBillingPage("pro");
      close();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setOpening(false);
    }
  };
  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        ref={(node) => { dialog.current = node; }}
        className="modal plan-upgrade"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-upgrade-title"
        aria-describedby="plan-upgrade-reason"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="plan-upgrade__header">
          <span className="plan-upgrade__eyebrow"><SparklesIcon size={13} />Vibyra Pro</span>
          <button className="icon-btn" type="button" aria-label="Close" onClick={close}><CloseIcon size={16} /></button>
        </header>
        <div className="plan-upgrade__content">
          <h2 id="plan-upgrade-title">{TITLES[notice.feature]}</h2>
          <p id="plan-upgrade-reason">{notice.message}</p>
          <ul className="plan-upgrade__list" aria-label="Vibyra Pro includes">
            {PRO_ADDS.map((item) => <li key={item}><CheckIcon size={12} />{item}</li>)}
          </ul>
          {error && <p className="plan-upgrade__error" role="alert">{error}</p>}
        </div>
        <footer className="plan-upgrade__actions">
          <button className="btn" type="button" onClick={close}>Not now</button>
          <button className="btn btn--primary" type="button" disabled={opening} onClick={() => void upgrade()}>
            {opening ? "Opening…" : "Get Vibyra Pro"}
          </button>
        </footer>
      </section>
    </div>
  );
}
