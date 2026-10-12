import React from "react";
import { isGuest, utc } from "./ownerData.js";

export default function AccountTable({ accounts, onSelect }) {
  return <div className="od-table-scroll" role="region" aria-label="Account directory" tabIndex="0">
    <table className="od-users-table"><thead><tr>
      <th>Account</th><th>Plan</th><th>Status</th><th>Joined</th><th>Last recorded use</th>
    </tr></thead><tbody>{accounts.map(account => <tr key={account.id}>
      <td><button className="od-account-button" onClick={() => onSelect(account.id)}>
        <span className="od-avatar">{isGuest(account) ? "G" : (account.name || account.email || "?")[0].toUpperCase()}</span>
        <span><strong>{isGuest(account) ? "Guest account" : account.name || "Unnamed account"}</strong>
          <small>{isGuest(account) ? "Guest #" + account.id : account.email}</small></span>
      </button></td>
      <td><span className={"od-badge " + (account.plan === "pro" ? "is-pro" : "")}>{account.plan || "Unknown"}</span></td>
      <td><span className={"od-badge " + (account.owner_banned_at ? "is-banned" : "")}>{account.owner_banned_at ? "Banned" : "Active"}</span>
        <small>{account.email_verified_at ? "Email verified" : isGuest(account) ? "Guest" : "Email unverified"}</small></td>
      <td>{utc(account.created_at, true)}</td><td>{utc(account.last_session_used_at, true)}</td>
    </tr>)}</tbody></table>
  </div>;
}
