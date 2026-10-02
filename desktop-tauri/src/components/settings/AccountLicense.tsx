import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AccountProfile, AccountSnapshot } from "../../types";
import { useAccountStore } from "../../state/accountStore";
import { longDate } from "../../lib/membership";

const messages: Record<string, string> = {
  pending_verification: "Verify your email to activate your Pro license.",
  unavailable: "Your account is ready, but the license could not be applied. Check the key or contact its issuer.",
  conflict: "Redeem your key after your current membership or pending checkout ends.",
  disabled: "License redemption is temporarily unavailable. Keep your key and try again later.",
  redeemed: "Your Pro license was applied.",
};

export function AccountLicense({ profile }: { profile: AccountProfile }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const redeem = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage("");
    const scope = profile.welcomeKey;
    try {
      const snapshot = await invoke<AccountSnapshot>("account_redeem_license", { licenseKey: key, expectedScope: scope });
      if (useAccountStore.getState().snapshot.profile?.welcomeKey !== scope) return;
      useAccountStore.getState().applySnapshot(snapshot);
      setKey(""); setMessage("Pro activated. Your membership and tokens are ready.");
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  };
  return <div className="account-license">
    {profile.license && <p>{profile.license.tokens.toLocaleString()} tokens {profile.license.allowance === "monthly" ? "each month" : "once"}
      {profile.license.nextAt ? ` · Next allowance ${longDate(profile.license.nextAt)}` : ""}. No recurring payment.</p>}
    {profile.licenseRedemptionStatus && <p role="status">{messages[profile.licenseRedemptionStatus]}</p>}
    <details><summary>Redeem license</summary><form onSubmit={redeem}>
      <label>License key<input type="password" value={key} onChange={e => setKey(e.target.value)} maxLength={100}
        autoComplete="off" spellCheck={false} placeholder="VPRO-…" disabled={busy} required /></label>
      <button className="btn btn--primary" disabled={busy || !key.trim()}>{busy ? "Applying…" : "Activate Pro"}</button>
    </form></details>
    {message && <p role="status">{message}</p>}
  </div>;
}
