import React from "react";
import Notice from "./Notice.jsx";

export default function AccountWarnings({ warnings = [] }) {
  if (!warnings.length) return null;
  return <section aria-label="Account warnings">
    <Notice tone="error"><strong>A message about your account</strong>
      <p>Please review the account warnings below. Contact support if you need help.</p>
      <ul>{warnings.map(warning => <li key={warning.id}>
        <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{warning.message}</p>
        <small>{new Date(/^\d{4}-\d\d-\d\d /.test(warning.created_at) ? warning.created_at.replace(" ", "T") + "Z" : warning.created_at).toLocaleDateString("en-GB", { dateStyle: "medium", timeZone: "UTC" })}</small>
      </li>)}</ul>
      {warnings.length === 20 && <small>Showing the 20 most recent warnings.</small>}
    </Notice>
  </section>;
}
