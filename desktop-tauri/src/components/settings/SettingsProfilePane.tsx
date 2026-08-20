import { useEffect, useState } from "react";

import { canEditEmail, logoutConfirmCopy, providerDisplayName, validateProfileEdit } from "../../lib/accountPolicy";
import { useAccountStore } from "../../state/accountStore";
import { useTerminalStore } from "../../state/terminalStore";
import { SettingRow, SettingsBlock } from "./SettingsShared";

export function SettingsProfilePane() {
  const profile = useAccountStore((s) => s.snapshot.profile);
  const secureStorage = useAccountStore((s) => s.snapshot.secureStorage);
  const busy = useAccountStore((s) => s.busy);
  const panes = useTerminalStore((s) => s.panes);
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

  if (!profile) {
    return <p className="settings-lead">Loading your account…</p>;
  }

  const emailEditable = canEditEmail(profile);
  const dirty = name !== profile.name || email !== profile.email;
  const running = panes.filter((p) => p.status === "running").length;
  const confirmCopy = logoutConfirmCopy(running);

  const save = async () => {
    const problem = validateProfileEdit({ name, email });
    if (problem) {
      setFeedback({ tone: "error", text: problem });
      return;
    }
    setSaving(true);
    const error = await useAccountStore.getState().updateProfile(name, email);
    setSaving(false);
    setFeedback(error ? { tone: "error", text: error } : { tone: "ok", text: "Profile saved." });
  };

  const sendMessage = async (send: () => Promise<string>) => {
    setFeedback({ tone: "ok", text: await send() });
  };

  return (
    <>
      <p className="settings-lead">
        Your Vibyra account. AI provider accounts are managed separately under Integrations.
      </p>
      <SettingsBlock label="Account">
        <div className="profile-summary">
          <span className="profile-summary__chip">{providerDisplayName(profile.provider)} account</span>
          <span className="profile-summary__chip">{profile.plan} plan</span>
          <span className={`profile-summary__chip ${profile.emailVerified ? "profile-summary__chip--ok" : "profile-summary__chip--warn"}`}>
            {profile.emailVerified ? "Email verified" : "Email unverified"}
          </span>
        </div>
        {!profile.emailVerified && (
          <div className="profile-inline-action">
            <span>Verify your email to secure account recovery.</span>
            <button className="btn" disabled={busy} onClick={() => void sendMessage(() => useAccountStore.getState().resendVerification())}>
              Resend email
            </button>
          </div>
        )}
      </SettingsBlock>
      <SettingsBlock label="Profile">
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
          <button className="btn btn--primary" disabled={!dirty || saving || busy} onClick={() => void save()}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </SettingsBlock>
      {emailEditable && (
        <SettingsBlock label="Password">
          <div className="profile-inline-action">
            <span>We’ll email you a link to reset your password.</span>
            <button className="btn" disabled={busy} onClick={() => void sendMessage(() => useAccountStore.getState().forgotPassword(profile.email))}>
              Send reset link
            </button>
          </div>
        </SettingsBlock>
      )}
      <SettingsBlock label="Session">
        {!secureStorage && (
          <p className="profile-note">
            The system credential store is unavailable, so this session lasts until you close
            Vibyra. You’ll need to sign in again next time.
          </p>
        )}
        {confirmingLogout && confirmCopy ? (
          <div className="profile-inline-action profile-inline-action--danger">
            <span>{confirmCopy}</span>
            <button className="btn" onClick={() => setConfirmingLogout(false)}>Cancel</button>
            <button className="btn profile-logout" disabled={busy} onClick={() => void useAccountStore.getState().logout()}>
              {busy ? "Logging out…" : "Log out"}
            </button>
          </div>
        ) : (
          <div className="profile-inline-action">
            <span>Signed in as {profile.email}.</span>
            <button
              className="btn profile-logout"
              disabled={busy}
              onClick={() => (confirmCopy ? setConfirmingLogout(true) : void useAccountStore.getState().logout())}
            >
              {busy ? "Logging out…" : "Log out"}
            </button>
          </div>
        )}
      </SettingsBlock>
    </>
  );
}
