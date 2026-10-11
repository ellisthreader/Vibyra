import React, { useState } from "react";

const when = (value) => new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" });

/** One invite field, and the invitations still waiting. The link itself is only ever emailed, never shown here. */
export default function TeamInvite({ data, busy, act, api }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const canAdmin = data.can.includes("invite_admin");
  const submit = async (event) => {
    event.preventDefault();
    if (await act(() => api.invite(email.trim(), canAdmin ? role : "member"))) setEmail("");
  };
  return <>
    <form className="team-invite" onSubmit={submit}>
      <label>Invite by email
        <input type="email" value={email} maxLength={254} placeholder="name@company.com" autoCapitalize="none" onChange={(e) => setEmail(e.target.value)} required />
      </label>
      {canAdmin && <label>Role<select value={role} onChange={(e) => setRole(e.target.value)}><option value="member">Member</option><option value="admin">Manager</option></select></label>}
      <button className="portal-button portal-button--secondary" disabled={busy || !email.trim()}>Send invite</button>
    </form>
    {data.invitations.length > 0 && <ul className="developer-list" aria-label="Open invitations">{data.invitations.map((i) => <li key={i.id}>
      <div><strong>{i.email}</strong><span>{i.role === "admin" ? "Manager" : "Member"} · expires {when(i.expiresAt)}</span></div>
      <button className="portal-link-button" disabled={busy} onClick={() => act(() => api.revoke(i.id))}>Revoke</button>
    </li>)}</ul>}
  </>;
}
