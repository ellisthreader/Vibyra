import React, { useCallback, useEffect, useState } from "react";
import PortalShell from "../components/PortalShell.jsx";
import Notice from "../components/Notice.jsx";
import TeamMembers from "../components/TeamMembers.jsx";
import TeamInvite from "../components/TeamInvite.jsx";
import TeamAdmin from "../components/TeamAdmin.jsx";
import TeamSsoCard from "../components/TeamSsoCard.jsx";
import { teamApi } from "../teamApi.js";
import { useTeamAction } from "../useTeamAction.js";
import { go } from "../navigation.js";
import { useWebsiteSession } from "../session/WebsiteSessionProvider.jsx";

export default function TeamPage() {
  const { user, loading, sessionError } = useWebsiteSession();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const { busy, error, run } = useTeamAction(setData);
  useEffect(() => { if (!loading && !user && !sessionError) go("/login?next=/account/team"); }, [loading, user, sessionError]);
  const load = useCallback(() => teamApi.overview().then((next) => { setData(next); setLoadError(""); })
    .catch((caught) => setLoadError(caught.status === 404 ? "Teams is not switched on for your account yet." : caught.message)), []);
  useEffect(() => { if (user) void load(); }, [user, load]);
  const leave = async () => { if (window.confirm("Leave this team?") && await run(teamApi.leave)) void load(); };
  const team = data?.team;
  return <PortalShell title="Team" intro="Your team, its roles and how people sign in. Everyone keeps their own tokens.">
    {loading && <p role="status">Loading…</p>}
    {(sessionError || loadError) && <Notice tone="error">{sessionError || loadError}</Notice>}
    {error && <Notice tone="error">{error}</Notice>}
    {user && data && !team && <section className="account-panel" aria-label="Start a team">
      <p className="panel-label">Start a team</p>
      {data.canCreate ? <form className="team-form" onSubmit={(e) => { e.preventDefault(); run(() => teamApi.create(name)); }}>
        <label>Team name<input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Acme" required /></label>
        <button className="portal-button portal-button--primary" disabled={busy || !name.trim()}>Create team</button>
      </form> : <p>Creating a team needs a plan that includes it. You can still join one by invitation.</p>}
    </section>}
    {user && data && team && <div className="account-grid">
      <section className="account-panel" aria-label="Members">
        <p className="panel-label">{team.name} · {team.seatsUsed} {team.seatsUsed === 1 ? "member" : "members"}{team.seats != null && ` of ${team.seats} seats`}</p>
        <TeamMembers data={data} busy={busy} act={run} api={teamApi} />
        {data.can.includes("invite") && <TeamInvite data={data} busy={busy} act={run} api={teamApi} />}
        {data.can.includes("rename") && <TeamAdmin data={data} busy={busy} act={run} api={teamApi} />}
        {data.you.monthCapCeilingTokens != null && <p className="team-note">Your monthly cap is limited to {data.you.monthCapCeilingTokens} tokens by your team.</p>}
      </section>
      {data.sso.visible && <TeamSsoCard sso={data.sso} busy={busy} act={run} api={teamApi} />}
      <button className="portal-link-button" disabled={busy} onClick={leave}>Leave team</button>
      <a className="portal-link-button" href="/account">Back to your account</a>
    </div>}
  </PortalShell>;
}
