import React, { useEffect, useState } from "react";
import PortalShell from "../components/PortalShell.jsx";
import Notice from "../components/Notice.jsx";
import { teamApi } from "../teamApi.js";
import { go } from "../navigation.js";
import { useWebsiteSession } from "../session/WebsiteSessionProvider.jsx";

const KEY = "vibyra.teamInvite";
// The secret travels in the URL fragment (never sent to the server on page load). It is kept for this tab only, across a sign-in.
const readToken = () => {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token");
  try {
    if (hash) { sessionStorage.setItem(KEY, hash); window.history.replaceState(null, "", window.location.pathname + window.location.search); }
    return hash || sessionStorage.getItem(KEY) || "";
  } catch { return hash || ""; }
};

export default function TeamJoinPage() {
  const { user, loading, sessionError } = useWebsiteSession();
  const [token] = useState(readToken);
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!loading && !user && !sessionError) go("/login?next=/team/join"); }, [loading, user, sessionError]);
  useEffect(() => {
    if (!user || !token) return;
    teamApi.preview(token).then(setInvite).catch((caught) => setError(caught.message));
  }, [user, token]);
  const accept = async () => {
    setBusy(true);
    try { await teamApi.accept(token); try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } go("/account/team"); }
    catch (caught) { setError(caught.message); setBusy(false); }
  };
  return <PortalShell title="Join a team" intro="You were invited to a team on Vibyra.">
    {loading && <p role="status">Loading…</p>}
    {sessionError && <Notice tone="error">{sessionError}</Notice>}
    {user && !token && <Notice tone="error">This invitation link is incomplete. Open the link from your email again.</Notice>}
    {error && <Notice tone="error">{error}</Notice>}
    {user && invite && <section className="account-panel" aria-label="Invitation">
      <p className="panel-label">Invitation</p>
      <h2>{invite.team}</h2>
      <p>You will join as {invite.role === "admin" ? "a manager" : "a member"}. You keep your own account and your own tokens.</p>
      <div className="account-actions"><button className="portal-button portal-button--primary" disabled={busy} onClick={accept}>{busy ? "Joining…" : "Join team"}</button></div>
    </section>}
  </PortalShell>;
}
