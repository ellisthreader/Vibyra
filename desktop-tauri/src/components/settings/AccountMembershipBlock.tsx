import { useState } from "react";

import { accountBillingPage, accountBillingPortal } from "../../ipc/accountBilling";
import { membershipView, sameDay } from "../../lib/membership";
import type { AccountProfile } from "../../types";
import { AppleMark } from "../auth/authMarks";
import { AccountCredits } from "./AccountCreditsBlock";
import { StatusChip } from "./SettingsControls";
import { SettingRow, SettingsBlock } from "./SettingsShared";

/**
 * One card for what this account is on: the plan and when it renews or ends,
 * what is left to spend, buying more, and where it is paid for. The billing
 * row is a mark and a word — Vibyra never claims to cancel what a store sold,
 * and tapping through to Apple says that better than a sentence does.
 */
export function AccountMembershipBlock({ profile }: { profile: AccountProfile }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const view = membershipView(profile);
  // The plan row already says the date; the credits note repeats it only when
  // credits refresh on some other day.
  const resetIsElsewhere = !sameDay(view.stateDate, profile.creditsResetAt);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsBlock label="Membership" panel="membership">
      <div className="settings-group">
        <SettingRow
          label={`${view.plan} plan`}
          hint={view.state ?? (view.paid ? undefined : "Upgrade for more credits and bigger models.")}
        >
          {view.paid && profile.membershipCancelAtPeriodEnd && <StatusChip tone="warn">Cancelling</StatusChip>}
          {!view.paid && (
            <button className="btn btn--primary" disabled={busy} onClick={() => void run(() => accountBillingPage("plans"))}>
              See plans
            </button>
          )}
        </SettingRow>

        <AccountCredits profile={profile} showResetDate={resetIsElsewhere} />

        {view.paid && view.billing && (
          <SettingRow
            label={
              view.manage === "appstore" ? (
                <span className="membership__billed"><AppleMark /> App Store</span>
              ) : (
                `${view.billing}${view.cycle ? ` · ${view.cycle}` : ""}`
              )
            }
          >
            {view.manage === "stripe" && (
              <button className="btn" disabled={busy} onClick={() => void run(accountBillingPortal)}>
                {busy ? "Opening…" : "Manage billing"}
              </button>
            )}
            {view.manage === "appstore" && (
              <button className="btn" disabled={busy} onClick={() => void run(() => accountBillingPage("appStore"))}>
                Open subscriptions
              </button>
            )}
          </SettingRow>
        )}
        {error && (
          <p className="profile-feedback profile-feedback--row profile-feedback--error" role="status">{error}</p>
        )}
      </div>
    </SettingsBlock>
  );
}
