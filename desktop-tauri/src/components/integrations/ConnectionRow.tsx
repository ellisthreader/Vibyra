import { useState } from "react";
import type { IntegrationConnection, IntegrationRequest } from "./types";

export function ConnectionRow({ connection: c, disabled, act }: {
  connection: IntegrationConnection;
  disabled: boolean;
  act: (key: string, request: IntegrationRequest) => Promise<boolean>;
}) {
  const [confirm, setConfirm] = useState(false);
  return <div className="integration-account">
    <label className="integration-account__access">
      <input type="checkbox" checked={c.assigned} disabled={disabled || (!c.assigned && c.status !== "connected")}
        onChange={(e) => void act(c.id, { operation: "grant", id: c.id, enabled: e.target.checked })} />
      <span><strong>{c.label}</strong><small>{c.environment === "test" ? "Test account · " : ""}
        {c.status !== "connected" ? "Reconnect needed" : c.assigned ? "Read access enabled" : "Enable read access"}</small></span>
    </label>
    <div className="integration-account__actions">
      <button className="btn btn--ghost" disabled={disabled} onClick={() => void act(c.id, { operation: "check", id: c.id })}>Check</button>
      <button className="btn btn--ghost" disabled={disabled} onClick={() => setConfirm(!confirm)}>Disconnect</button>
    </div>
    {confirm && <div className="integration-account__confirm">
      <p>Disconnect this account from all your teammates and devices?</p>
      <button className="btn btn--secondary" disabled={disabled} onClick={() => setConfirm(false)}>Keep account</button>
      <button className="btn btn--danger" disabled={disabled} onClick={() => void act(c.id, { operation: "disconnect", id: c.id })}>Disconnect account</button>
    </div>}
  </div>;
}
