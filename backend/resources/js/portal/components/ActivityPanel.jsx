import React, { useState } from "react";
import { developerApi } from "../developerApi.js";

const detailText = detail => Object.entries(detail ?? {}).map(([k, v]) => `${k}: ${v}`).join(" · ");

/** Read-only account activity. Draws nothing until the server offers it (404 while the flag is off). */
export default function ActivityPanel({ accountId }) {
  const [items, setItems] = useState(null);
  const [next, setNext] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async (before = null) => {
    setBusy(true); setError("");
    try {
      const page = await developerApi.activity(before);
      setItems(prev => before ? [...(prev ?? []), ...page.items] : page.items); setNext(page.next);
    } catch (caught) { if (caught.status !== 404) setError(caught.message); }
    finally { setBusy(false); }
  };
  return <section className="account-panel" aria-label="Account activity" key={accountId}>
    <p className="panel-label">Activity</p>
    <p>Sign-ins, devices, keys, webhooks, connections and limits for this account.</p>
    {items === null ? <button className="portal-link-button" disabled={busy} onClick={() => load()}>Show activity</button>
      : items.length === 0 ? <p role="status">Nothing recorded yet.</p>
        : <ul className="developer-log">{items.map(item => <li key={item.id}>
          <strong>{item.title}</strong> <span>{new Date(item.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}{detailText(item.detail) && ` · ${detailText(item.detail)}`}</span></li>)}</ul>}
    {next && <button className="portal-link-button" disabled={busy} onClick={() => load(next)}>More activity</button>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
