import React, { useState } from "react";
import { developerApi } from "../developerApi.js";
import "../../../css/portal/developer.css";

const when = value => value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Never";

export default function ApiKeysPanel({ keys, scopes, onChange }) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState(["runs:read"]);
  const [secret, setSecret] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const toggle = scope => setPicked(now => now.includes(scope) ? now.filter(s => s !== scope) : [...now, scope]);
  const create = async event => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const made = await developerApi.createKey({ name: name.trim(), scopes: picked });
      setSecret(made.secret); setName(""); await onChange();
    } catch (caught) { setError(caught.message); }
    finally { setBusy(false); }
  };
  const revoke = async key => {
    if (!window.confirm(`Revoke "${key.name}"? Anything using it stops working immediately.`)) return;
    try { await developerApi.revokeKey(key.id); await onChange(); } catch (caught) { setError(caught.message); }
  };
  const live = keys.filter(key => !key.revokedAt);
  return <section className="account-panel" aria-label="API keys">
    <p className="panel-label">API keys</p>
    <p>Personal keys for your own scripts and tools. A key can read and start work within its scopes. It can never approve an action, change billing or manage keys.</p>
    {secret && <div className="developer-secret" role="status">
      <p>Copy this key now. It is shown once and cannot be recovered.</p>
      <code>{secret}</code>
      <button className="portal-link-button" onClick={() => navigator.clipboard?.writeText(secret)}>Copy</button>
      <button className="portal-link-button" onClick={() => setSecret(null)}>Done</button>
    </div>}
    {live.length > 0 && <ul className="developer-list">{live.map(key => <li key={key.id}>
      <div><strong>{key.name}</strong><span>{key.prefix}… · {key.scopes.join(", ")} · {key.ratePerMinute}/min</span><span>Last used: {when(key.lastUsedAt)}</span></div>
      <button className="portal-link-button" onClick={() => revoke(key)}>Revoke</button>
    </li>)}</ul>}
    <form className="portal-form developer-form" onSubmit={create}>
      <label>Key name<input value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder="CI on my laptop" required /></label>
      <fieldset><legend>Scopes</legend>{scopes.map(scope => <label key={scope} className="developer-check">
        <input type="checkbox" checked={picked.includes(scope)} onChange={() => toggle(scope)} />{scope}</label>)}</fieldset>
      <button className="portal-button portal-button--secondary" disabled={busy || !name.trim() || picked.length === 0}>{busy ? "Creating…" : "Create key"}</button>
    </form>
    {error && <p role="alert">{error}</p>}
  </section>;
}
