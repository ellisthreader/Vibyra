import { useEffect, useState } from "react";

import { canEditEmail, logoutConfirmCopy, providerDisplayName, validateProfileEdit } from "../../lib/accountPolicy";
import { useAccountStore } from "../../state/accountStore";
import { useTerminalStore } from "../../state/terminalStore";
import { StatusChip } from "./SettingsControls";
import { SettingRow, SettingsBlock } from "./SettingsShared";

/**
 * Who is signed in, in one card; the edit form only when asked for. Provider
 * accounts for terminals are a different thing and live under AI accounts.
 */
export function SettingsAccountPane() {
  const profile = useAccountStore((s) => s.snapshot.profile);
  const secureStorage = useAccountStore((s) => s.snapshot.secureStorage);
  const busy = useAccountStore((s) => s.busy);
  const panes = useTerminalStore((s) => s.panes);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile?.name ?? "");
  const [email, setEmail] = useState(profile?.email ?? "");
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  useEffect(() => {
    void useAccountStore.getState().refreshProfile();
  }, []);
  useEffect(() => {
    setName(profile?.name ?? "");
    setEmail(profile?.email ?? "");
  }, [profile?.name, profile?.email]);

  if (!profile) return <p className="settings-lead">Loading your account…</p>;

  const emailEditable = canEditEmail(profile);
  const dirty = name !== profile.name || email !== profile.email;
  const running = panes.filter((p) => p.status === "running").length;
  const confirmCopy = logoutConfirmCopy(running);
  const initial = (profile.name || profile.email).trim().charAt(0).toUpperCase();

  const save = async () => {
    const problem = validateProfileEdit({ name, email });
    if (problem) return setFeedback({ tone: "error", text: problem });
    setSaving(true);
    const error = await useAccountStore.getState().updateProfile(name, email);
    setSaving(false);
    setFeedback(error ? { tone: "error", text: error } : { tone: "ok", text: "Profile saved." });
    if (!error) setEditing(false);
  };
  const sendMessage = async (send: () => Promise<string>) => setFeedback({ tone: "ok", text: await send() });

  return (
    <>
      <SettingsBlock label="Account">
        <div className="settings-group">
          <div className="account-card">
            <span className="account-card__avatar" aria-hidden="true">{initial}</span>
            <div className="account-card__text">
              <span className="account-card__name">{profile.name || profile.email}</span>
              <span className="account-card__meta">
                {profile.email} · {providerDisplayName(profile.provider)} account · {profile.plan} plan
              </span>
            </div>
            {!editing && (
              <button className="btn" onClick={() => { setFeedback(null); setEditing(true); }}>Edit</button>
            )}
          </div>
          {!profile.emailVerified && (
            <SettingRow label="Email not verified" hint="Verify your email to secure account recovery.">
              <StatusChip tone="warn">Action needed</StatusChip>
              <button className="btn" disabled={busy} onClick={() => void sendMessage(() => useAccountStore.getState().resendVerification())}>
                Resend email
              </button>
            </SettingRow>
          )}
          {editing && (
            <>
              <SettingRow label="Display name" hint="Shown in the title bar and on your devices.">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Display name" />
              </SettingRow>
              <SettingRow
                label="Email address"
                hint={emailEditable ? "Changing it sends a new verification email." : `Managed by ${providerDisplayName(profile.provider)}.`}
              >
                <input className="input" type="email" value={email} disabled={!emailEditable} onChange={(e) => setEmail(e.target.value)} aria-label="Email address" />
              </SettingRow>
              <div className="profile-actions">
                <span className={`profile-feedback ${feedback?.tone === "error" ? "profile-feedback--error" : ""}`} role="status" aria-live="polite">
                  {feedback?.text}
                </span>
                <button className="btn" onClick={() => { setEditing(false); setName(profile.name); setEmail(profile.email); }}>Cancel</button>
                <button className="btn btn--primary" disabled={!dirty || saving || busy} onClick={() => void save()}>
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </>
          )}
          {!editing && feedback?.text && (
            <p className={`profile-feedback profile-feedback--row ${feedback.tone === "error" ? "profile-feedback--error" : ""}`} role="status">{feedback.text}</p>
          )}
        </div>
      </SettingsBlock>

      {emailEditable && (
        <SettingsBlock label="Password">
          <div className="settings-group">
            <SettingRow label="Reset password" hint="We’ll email you a link.">
              <button className="btn" disabled={busy} onClick={() => void sendMessage(() => useAccountStore.getState().forgotPassword(profile.email))}>
                Send reset link
              </button>
            </SettingRow>
          </div>
        </SettingsBlock>
      )}

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
              <button className="btn profile-logout" disabled={busy} onClick={() => void useAccountStore.getState().logout()}>
                {busy ? "Logging out…" : "Log out"}
              </button>
            </SettingRow>
          ) : (
            <SettingRow label="Signed in on this Mac" hint={running ? `${running} terminal${running === 1 ? "" : "s"} running.` : undefined}>
              <button
                className="btn profile-logout"
                disabled={busy}
                onClick={() => (confirmCopy ? setConfirmingLogout(true) : void useAccountStore.getState().logout())}
              >
                {busy ? "Logging out…" : "Log out"}
              </button>
            </SettingRow>
          )}
        </div>
      </SettingsBlock>
    </>
  );
}
