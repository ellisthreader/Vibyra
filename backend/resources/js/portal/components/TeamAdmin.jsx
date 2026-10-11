import React, { useEffect, useState } from "react";

/** Team name, default monthly cap per member, and (owners) handing the team over. Each is one field and one button. */
export default function TeamAdmin({ data, busy, act, api }) {
  const can = new Set(data.can);
  const [name, setName] = useState(data.team.name);
  const [cap, setCap] = useState(data.team.defaultMonthCapTokens ?? "");
  const [to, setTo] = useState("");
  useEffect(() => { setName(data.team.name); setCap(data.team.defaultMonthCapTokens ?? ""); }, [data.team.name, data.team.defaultMonthCapTokens]);
  const others = data.members.filter((m) => !m.you);
  return <div className="team-admin">
    {can.has("rename") && <form onSubmit={(e) => { e.preventDefault(); act(() => api.rename(name)); }}>
      <label>Team name<input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} required /></label>
      <button className="portal-button portal-button--secondary" disabled={busy || name.trim() === data.team.name}>Rename</button>
    </form>}
    {can.has("set_cap") && <form onSubmit={(e) => { e.preventDefault(); act(() => api.defaultCap(cap === "" ? null : Number(cap))); }}>
      <label>Default monthly cap per member (tokens)<input type="number" min="1" step="1" inputMode="numeric" value={cap} placeholder="Off" onChange={(e) => setCap(e.target.value)} /></label>
      <button className="portal-button portal-button--secondary" disabled={busy}>Save cap</button>
      <p>New members start at this cap and can lower it. Only a manager or owner can raise it. Everyone keeps their own tokens.</p>
    </form>}
    {can.has("transfer") && others.length > 0 && <form onSubmit={(e) => { e.preventDefault(); window.confirm("Hand the team over? You become a manager.") && act(() => api.transfer(Number(to))); }}>
      <label>Hand over ownership<select value={to} onChange={(e) => setTo(e.target.value)} required><option value="">Choose a member</option>
        {others.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      <button className="portal-button portal-button--secondary" disabled={busy || !to}>Hand over</button>
    </form>}
  </div>;
}
