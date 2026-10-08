import { useId, useRef } from "react";
import { useNestedDialog } from "../../../lib/useNestedDialog";

export interface CloudConfirmation { title: string; detail: string; action: string; danger?: boolean; run(): void }
export function CloudPageConfirm({ confirmation, onClose }: { confirmation: CloudConfirmation; onClose(): void }) {
  const ref = useRef<HTMLDivElement>(null), title = useId(), detail = useId();
  useNestedDialog(ref, true, onClose);
  return <div className="cloud-page__confirm-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={ref} className="cloud-page__confirm" role="alertdialog" aria-modal="true" aria-labelledby={title} aria-describedby={detail} data-escape-owner>
      <h3 id={title}>{confirmation.title}</h3><p id={detail}>{confirmation.detail}</p>
      <div className="cloud-page__confirm-actions">
        <button className="cloud-page__action" onClick={onClose}>Cancel</button>
        <button className={`cloud-page__action ${confirmation.danger ? "cloud-page__action--danger" : "cloud-page__action--primary"}`}
          onClick={() => { onClose(); confirmation.run(); }}>{confirmation.action}</button>
      </div>
    </div>
  </div>;
}
