import { useState } from "react";

import { logoutConfirmCopy } from "../../lib/accountPolicy";
import type { AccountProfile } from "../../types";
import { useAccountStore } from "../../state/accountStore";
import { useTerminalStore } from "../../state/terminalStore";
import { SettingRow, SettingsBlock } from "./SettingsShared";

/** The password reset and the way out. Both are account actions rather than
 * settings, so they share one card language with the rest of the pane instead
 * of the bespoke bordered strips they used to be. */
export function ProfileSessionBlock({
  profile,
  emailEditable,
  onMessage,
}: {
  profile: AccountProfile;
  emailEditable: boolean;
  onMessage: (send: () => Promise<string>) => void;
}) {
  const busy = useAccountStore((s) => s.busy);
  const secureStorage = useAccountStore((s) => s.snapshot.secureStorage);
  const running = useTerminalStore((s) => s.panes.filter((p) => p.status === "running").length);
  const [confirming, setConfirming] = useState(false);
  const confirmCopy = logoutConfirmCopy(running);

  return (
    <>
      {emailEditable && (
        <SettingsBlock label="Password">
          <div className="settings-group">
            <SettingRow label="Reset your password" hint="We’ll email you a link to choose a new one.">
              <button
                className="btn"
                disabled={busy}
                onClick={() => onMessage(() => useAccountStore.getState().forgotPassword(profile.email))}
              >
                Send reset link
              </button>
            </SettingRow>
          </div>
        </SettingsBlock>
      )}
      <SettingsBlock label="Session">
        <div className="settings-group">
          {!secureStorage && (
            <p className="settings-note">
              The system credential store is unavailable, so this session lasts until you close
              Vibyra. You’ll need to sign in again next time.
            </p>
          )}
          <SettingRow
            label={confirming && confirmCopy ? "Log out anyway?" : "Signed in"}
            hint={confirming && confirmCopy ? confirmCopy : profile.email}
          >
            {confirming && confirmCopy ? (
              <span className="settings-row-actions">
                <button className="btn btn--secondary" onClick={() => setConfirming(false)}>Cancel</button>
                <button className="btn btn--danger" disabled={busy} onClick={() => void useAccountStore.getState().logout()}>
                  {busy ? "Logging out…" : "Log out"}
                </button>
              </span>
            ) : (
              <button
                className="btn profile-logout"
                disabled={busy}
                onClick={() => (confirmCopy ? setConfirming(true) : void useAccountStore.getState().logout())}
              >
                {busy ? "Logging out…" : "Log out"}
              </button>
            )}
          </SettingRow>
        </div>
      </SettingsBlock>
    </>
  );
}
