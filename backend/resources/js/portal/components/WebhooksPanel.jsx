import React, { useState } from "react";
import { developerApi } from "../developerApi.js";
import "../../../css/portal/developer.css";

const when = value => value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";

function Deliveries({ id }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const load = () => developerApi.deliveries(id).then(data => setRows(data.deliveries)).catch(e => setError(e.message));
  if (error) return <p role="alert">{error}</p>;
  if (!rows) return <button className="portal-link-button" onClick={load}>Show recent deliveries</button>;
  return rows.length === 0 ? <p>Nothing sent yet.</p> : <ul className="developer-log">{rows.map(row => <li key={row.id}>
    {when(row.createdAt)} · {row.event} · {row.state}{row.status ? ` (${row.status})` : row.error ? ` (${row.error})` : ""} · {row.attempts} {row.attempts === 1 ? "try" : "tries"}</li>)}</ul>;
}

export default function WebhooksPanel({ webhooks, events, onChange }) {
  const [url, setUrl] = useState("");
  const [picked, setPicked] = useState(["run.completed", "run.failed"]);
  const [secret, setSecret] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const toggle = event => setPicked(now => now.includes(event) ? now.filter(e => e !== event) : [...now, event]);
  const act = async work => { setError(""); try { await work(); await onChange(); } catch (caught) { setError(caught.message); } };
  const create = async event => {
    event.preventDefault(); setBusy(true); setError("");
    try { const made = await developerApi.createWebhook({ url: url.trim(), events: picked }); setSecret(made.secret); setUrl(""); await onChange(); }
    catch (caught) { setError(caught.message); }
    finally { setBusy(false); }
  };
  return <section className="account-panel" aria-label="Webhooks">
    <p className="panel-label">Webhooks</p>
    <p>Vibyra posts a signed message to your HTTPS address when a run changes. It carries ids and state only, never your prompts or results.</p>
    {secret && <div className="developer-secret" role="status">
      <p>Signing secret. Shown once; use it to check the <code>Vibyra-Signature</code> header.</p>
      <code>{secret}</code>
      <button className="portal-link-button" onClick={() => navigator.clipboard?.writeText(secret)}>Copy</button>
      <button className="portal-link-button" onClick={() => setSecret(null)}>Done</button>
    </div>}
    {webhooks.length > 0 && <ul className="developer-list">{webhooks.map(hook => <li key={hook.id}>
      <div><strong>{hook.url}</strong><span>{hook.events.join(", ")}</span>
        {hook.paused && <span role="status">{hook.pausedReason === "failing" ? "Paused after repeated failures" : "Paused"}</span>}
        <Deliveries id={hook.id} /></div>
      <div className="developer-actions">
        <button className="portal-link-button" onClick={() => act(() => developerApi.pauseWebhook(hook.id, !hook.paused))}>{hook.paused ? "Resume" : "Pause"}</button>
        <button className="portal-link-button" onClick={() => window.confirm("Remove this webhook?") && act(() => developerApi.deleteWebhook(hook.id))}>Remove</button>
      </div></li>)}</ul>}
    <form className="portal-form developer-form" onSubmit={create}>
      <label>HTTPS address<input type="url" value={url} maxLength={500} onChange={e => setUrl(e.target.value)} placeholder="https://example.com/vibyra" required /></label>
      <fieldset><legend>Events</legend>{events.map(name => <label key={name} className="developer-check">
        <input type="checkbox" checked={picked.includes(name)} onChange={() => toggle(name)} />{name}</label>)}</fieldset>
      <button className="portal-button portal-button--secondary" disabled={busy || !url.trim() || picked.length === 0}>{busy ? "Adding…" : "Add webhook"}</button>
    </form>
    {error && <p role="alert">{error}</p>}
  </section>;
}
