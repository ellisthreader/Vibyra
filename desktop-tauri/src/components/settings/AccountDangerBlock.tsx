import { useState } from "react";

import {
  accountDeleteCancel,
  accountDeleteWithPassword,
  accountDeleteWithProvider,
} from "../../ipc/accountSecurity";
import { providerDisplayName } from "../../lib/accountPolicy";
import { membershipView } from "../../lib/membership";
import { useAccountStore } from "../../state/accountStore";
import type { AccountProfile } from "../../types";
import { SettingRow, SettingsBlock } from "./SettingsShared";

/** Leaving. Said in full before anything is asked for, and proved the way
 * this account was made: its password, or its provider once more. */
export function AccountDangerBlock({ profile }: { profile: AccountProfile }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const provider = proofKind(profile.provider);
  const store = membershipView(profile).manage === "appstore";

  const finish = async (action: () => Promise<void>) => {
    setWaiting(true);
    setError(null);
    try {
      await action();
      await useAccountStore.getState().endSession();
    } catch (cause) {
      setError(String(cause));
      setWaiting(false);
    }
  };

  return (
    <SettingsBlock label="Danger zone" panel="danger">
      {!open ? (
        <button className="account-danger__open" onClick={() => { setError(null); setOpen(true); }}>
          Delete account
        </button>
      ) : (
        <div className="settings-group">
          <div className="account-danger">
            <p>Deleting your Vibyra account removes:</p>
            <ul>
              <li>your account, its name and its sign-in</li>
              <li>your chats, memory and published projects</li>
              <li>your membership and any credits left on it</li>
            </ul>
            <p className="account-danger__note">
              This cannot be undone.
              {store ? " Cancel your subscription with Apple as well — deleting the account does not stop it." : ""}
            </p>
          </div>
          {provider === "email" && (
            <SettingRow label="Confirm with your password" stack danger>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                aria-label="Password"
              />
            </SettingRow>
          )}
          {provider === "other" && (
            <SettingRow
              label={`Signed in with ${providerDisplayName(profile.provider)}`}
              hint="Delete this account from the Vibyra phone app or the website, where that sign-in can be proved again."
              danger
            />
          )}
          <div className="profile-actions">
            <span className={`profile-feedback ${error ? "profile-feedback--error" : ""}`} role="status" aria-live="polite">
              {error ?? (waiting && provider === "provider" ? "Waiting for you to confirm in your browser…" : "")}
            </span>
            <button
              className="btn"
              onClick={() => {
                if (waiting) void accountDeleteCancel();
                setWaiting(false);
                setPassword("");
                setOpen(false);
              }}
            >
              Cancel
            </button>
            {provider === "email" && (
              <button
                className="btn btn--danger"
                disabled={waiting || password.length === 0}
                onClick={() => void finish(() => accountDeleteWithPassword(password))}
              >
                {waiting ? "Deleting…" : "Delete account"}
              </button>
            )}
            {provider === "provider" && (
              <button
                className="btn btn--danger"
                disabled={waiting}
                onClick={() => void finish(() => accountDeleteWithProvider(profile.provider))}
              >
                {waiting ? "Waiting…" : `Confirm with ${providerDisplayName(profile.provider)}`}
              </button>
            )}
          </div>
        </div>
      )}
    </SettingsBlock>
  );
}

/** How this account can prove itself: its password, its provider signing in
 * again, or — for a sign-in the Mac cannot perform — neither. */
function proofKind(provider: string): "email" | "provider" | "other" {
  if (provider === "google" || provider === "apple") return "provider";
  return provider === "email" || provider === "" ? "email" : "other";
}
