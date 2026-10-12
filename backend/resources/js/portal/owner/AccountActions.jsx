import React, { useState } from "react";
import AccountActionForm from "./AccountActionForm.jsx";
import useAccountAction from "./useAccountAction.js";
import { actionLabels } from "./ownerActionProtocol.js";

export default function AccountActions({ profile, ownerId, access, onComplete }) {
  const [action, setAction] = useState(null);
  const flow = useAccountAction({ ownerId, accountId: profile.account.id, access,
    onComplete: () => { setAction(null); onComplete(); } });
  const capabilities = profile.capabilities;
  return <section className="od-account-controls" aria-label="Manage this account">
    <h3>Account actions</h3>
    {capabilities.protected ? <p className="od-note">Owner accounts are protected from these account actions.</p> : <>
      {flow.pending ? <div className="od-pending" role="status"><strong>Action awaiting confirmation</strong>
        <p>Check the recorded result before making another change. Closing this account keeps its recovery reference.</p>
        <div className="od-actions"><button className="od-button od-primary" disabled={flow.busy} onClick={flow.check}>{flow.busy ? "Checking…" : "Check action status"}</button>
          <button className="od-button" disabled={flow.busy} onClick={flow.cancel}>Cancel if not applied</button></div>
      </div> : action ? <AccountActionForm key={action} action={action} profile={profile} busy={flow.busy} onSubmit={flow.submit} onCancel={() => setAction(null)} />
        : <div className="od-actions">{[["credit", "Give credits"], ["warn", "Warn user"], ["ban", "Ban account"], ["unban", "Unban account"]]
          .filter(([key]) => capabilities[key]).map(([key, label]) => <button key={key} className={"od-button " + (key === "ban" ? "od-danger" : "")}
            disabled={!flow.storageReady || flow.busy} onClick={() => setAction(key)}>{label}</button>)}</div>}
      {flow.error && <p className="od-error-text" role="alert">{flow.error}</p>}
      {flow.receipt && !action && <p className="od-success" role="status">{actionLabels[flow.receipt.action]}. {flow.receipt.action === "cancelled" ? "No account change was applied." : "Saved in the action history."}</p>}
    </>}
  </section>;
}
