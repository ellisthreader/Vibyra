import React, { useEffect, useState } from "react";

/** The owner's single sign-on card: provider details, the DNS record that proves the domain, then on/off and "require". */
export default function TeamSsoCard({ sso, busy, act, api }) {
  const [f, setF] = useState({ issuer: sso.issuer ?? "", clientId: sso.clientId ?? "", clientSecret: "", domain: sso.domain ?? "" });
  useEffect(() => setF((v) => ({ ...v, issuer: sso.issuer ?? v.issuer, clientId: sso.clientId ?? v.clientId, domain: sso.domain ?? v.domain, clientSecret: "" })), [sso.issuer, sso.clientId, sso.domain]);
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }));
  const save = (e) => { e.preventDefault(); act(() => api.saveSso({ ...f, clientSecret: f.clientSecret || null })); };
  return <section className="account-panel team-sso" aria-label="Single sign-on">
    <p className="panel-label">Single sign-on</p>
    <p>Let people sign in with your OpenID Connect provider. Add this redirect address there: <code>{sso.redirectUri}</code></p>
    <form className="team-form" onSubmit={save}>
      <label>Issuer<input value={f.issuer} onChange={set("issuer")} placeholder="https://login.company.com" maxLength={300} required /></label>
      <label>Client ID<input value={f.clientId} onChange={set("clientId")} maxLength={200} required /></label>
      <label>Client secret<input type="password" value={f.clientSecret} onChange={set("clientSecret")} autoComplete="off" placeholder={sso.hasSecret ? "Saved. Leave empty to keep it." : ""} required={!sso.configured} /></label>
      <label>Email domain<input value={f.domain} onChange={set("domain")} placeholder="company.com" maxLength={253} required /></label>
      <button className="portal-button portal-button--secondary" disabled={busy}>Save</button>
    </form>
    {sso.configured && !sso.domainVerified && <div className="team-dns">
      <p>Add this DNS TXT record, then check it. It can take a few minutes to appear.</p>
      <code>{sso.dns.name}</code><code>{sso.dns.value}</code>
      <button className="portal-button portal-button--secondary" disabled={busy} onClick={() => act(api.verifySso)}>Check domain</button>
    </div>}
    {sso.domainVerified && <>
      <p className="team-ok">{sso.domain} is verified{sso.domainMethod === "manual" ? " by Vibyra" : ""}.</p>
      <label className="developer-check team-check"><input type="checkbox" checked={sso.enabled} disabled={busy} onChange={(e) => act(() => api.enableSso(e.target.checked, false))} />Allow sign-in with SSO</label>
      <label className="developer-check team-check"><input type="checkbox" checked={sso.requireSso} disabled={busy || !sso.enabled}
        onChange={(e) => act(() => api.enableSso(true, e.target.checked))} />Require SSO for {sso.domain} (owners keep their password)</label>
    </>}
    {sso.configured && <button className="portal-link-button" disabled={busy} onClick={() => window.confirm("Remove SSO settings?") && act(api.removeSso)}>Remove SSO</button>}
  </section>;
}
