import React from "react";
import "../../../css/portal/team.css";

const ROLE_NAMES = { owner: "Owner", admin: "Manager", member: "Member" };

function CapField({ member, disabled, onSave }) {
  const [value, setValue] = React.useState(member.monthCapTokens ?? "");
  React.useEffect(() => setValue(member.monthCapTokens ?? ""), [member.monthCapTokens]);
  const commit = () => {
    const next = value === "" ? null : Number(value);
    if (next !== (member.monthCapTokens ?? null)) onSave(member.id, next);
  };
  return <input className="team-cap" type="number" min="1" step="1" inputMode="numeric" value={value} placeholder="Default" disabled={disabled}
    aria-label={`Monthly cap for ${member.name}`} onChange={(e) => setValue(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />;
}

/** The one table: who is in the team, their role, their monthly token cap. Controls appear only for what the caller's role may do. */
export default function TeamMembers({ data, busy, act, api }) {
  const can = new Set(data.can);
  const rank = { owner: 3, admin: 2, member: 1 };
  const mine = rank[data.role];
  return <table className="team-table">
    <thead><tr><th>Name</th><th>Role</th>{can.has("set_cap") && <th>Monthly cap (tokens)</th>}<th><span className="team-sr">Actions</span></th></tr></thead>
    <tbody>{data.members.map((m) => {
      const outranked = !m.you && (data.role === "owner" || mine > rank[m.role]);
      return <tr key={m.id}>
        <td data-label="Name"><strong>{m.name}{m.you && " (you)"}</strong>{m.email && <span>{m.email}</span>}</td>
        <td data-label="Role">{can.has("change_role") && !m.you
          ? <select aria-label={`Role for ${m.name}`} value={m.role} disabled={busy} onChange={(e) => act(() => api.setRole(m.id, e.target.value))}>
            {Object.entries(ROLE_NAMES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          : ROLE_NAMES[m.role]}</td>
        {can.has("set_cap") && <td data-label="Monthly cap">{outranked || m.you
          ? <CapField member={m} disabled={busy} onSave={(id, tokens) => act(() => api.memberCap(id, tokens))} /> : <span>{m.monthCapTokens ?? "Team default"}</span>}</td>}
        <td data-label="" className="team-actions">{can.has("remove") && outranked &&
          <button className="portal-link-button" disabled={busy} onClick={() => window.confirm(`Remove ${m.name} from the team?`) && act(() => api.remove(m.id))}>Remove</button>}</td>
      </tr>;
    })}</tbody>
  </table>;
}
