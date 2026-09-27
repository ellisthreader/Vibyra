import { computerName } from "../../lib/platform";
import { useEffect, useState } from "react";

import { accountOpenLegal } from "../../ipc/account";
import { logoutConfirmCopy } from "../../lib/accountPolicy";
import { useAccountStore } from "../../state/accountStore";
import { useTerminalStore } from "../../state/terminalStore";
import { AccountDangerBlock } from "./AccountDangerBlock";
import { AccountDevicesBlock } from "./AccountDevicesBlock";
import { AccountIdentityBlock } from "./AccountIdentityBlock";
import { AccountMembershipBlock } from "./AccountMembershipBlock";
import { AccountSecurityBlock } from "./AccountSecurityBlock";
import { StatusChip } from "./SettingsControls";
import { SettingRow, SettingsBlock } from "./SettingsShared";

/**
 * The account, top to bottom: who you are, what you pay for, what you have
 * left, how it is protected, where it is signed in, and how to leave. The
 * provider accounts terminals use are a different thing and live under AI
 * accounts.
 */
export function SettingsAccountPane() {
  const profile = useAccountStore((s) => s.snapshot.profile);
  const secureStorage = useAccountStore((s) => s.snapshot.secureStorage);
  const busy = useAccountStore((s) => s.busy);
  const panes = useTerminalStore((s) => s.panes);
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  useEffect(() => {
    void useAccountStore.getState().refreshProfile();
  }, []);

  if (!profile) return <p className="settings-lead">Loading your account…</p>;

  const running = panes.filter((p) => p.status === "running").length;
  const confirmCopy = logoutConfirmCopy(running);

  return (
    <>
      <AccountIdentityBlock profile={profile} />
      <AccountMembershipBlock profile={profile} />
      <AccountSecurityBlock profile={profile} />
      <AccountDevicesBlock />

      <SettingsBlock label="Session">
        <div className="settings-group">
          {!secureStorage && (
            <SettingRow label="Session is not remembered" hint="The system credential store is unavailable, so you’ll sign in again next time you open Vibyra.">
              <StatusChip tone="warn">Keychain unavailable</StatusChip>
            </SettingRow>
          )}
          {confirmingLogout && confirmCopy ? (
            <SettingRow label="Log out?" hint={confirmCopy} danger>
              <button className="btn" onClick={() => setConfirmingLogout(false)}>Cancel</button>
              <button className="btn btn--danger" disabled={busy} onClick={() => void useAccountStore.getState().logout()}>
                {busy ? "Logging out…" : "Log out"}
              </button>
            </SettingRow>
          ) : (
            <SettingRow label={`Signed in on this ${computerName}`} hint={running ? `${running} terminal${running === 1 ? "" : "s"} running.` : undefined}>
              <button
                className="btn btn--danger"
                disabled={busy}
                onClick={() => (confirmCopy ? setConfirmingLogout(true) : void useAccountStore.getState().logout())}
              >
                {busy ? "Logging out…" : "Log out"}
              </button>
            </SettingRow>
          )}
        </div>
      </SettingsBlock>

      <AccountDangerBlock profile={profile} />

      <footer className="account-legal">
        <button className="account-legal__link" onClick={() => void accountOpenLegal("privacy")}>Privacy Policy</button>
        <span aria-hidden="true">·</span>
        <button className="account-legal__link" onClick={() => void accountOpenLegal("terms")}>Terms of Service</button>
      </footer>
    </>
  );
}
