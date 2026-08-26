import { useEffect, useState } from "react";

import { canEditEmail, providerDisplayName, validateProfileEdit } from "../../lib/accountPolicy";
import { useAccountStore } from "../../state/accountStore";
import { ProfileSessionBlock } from "./ProfileSessionBlock";
import { SettingRow, SettingsBlock } from "./SettingsShared";

export function SettingsProfilePane() {
  const profile = useAccountStore((s) => s.snapshot.profile);
  const busy = useAccountStore((s) => s.busy);
  const [name, setName] = useState(profile?.name ?? "");
  const [email, setEmail] = useState(profile?.email ?? "");
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void useAccountStore.getState().refreshProfile();
  }, []);

  useEffect(() => {
    setName(profile?.name ?? "");
    setEmail(profile?.email ?? "");
  }, [profile?.name, profile?.email]);

  if (!profile) {
    return <p className="settings-loading">Loading your account…</p>;
  }

  const emailEditable = canEditEmail(profile);
  const dirty = name !== profile.name || email !== profile.email;

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

  const sendMessage = (send: () => Promise<string>) => {
    void send().then((text) => setFeedback({ tone: "ok", text }));
  };

  return (
    <>
      <p className="settings-lead">
        Your Vibyra account. AI provider accounts are managed separately under Integrations.
      </p>
      <SettingsBlock label="Account">
        <div className="settings-group">
          <SettingRow label="Signed in with" hint="How this Vibyra account authenticates.">
            <span className="settings-value">{providerDisplayName(profile.provider)}</span>
          </SettingRow>
          <SettingRow label="Plan" hint="What this account is entitled to.">
            <span className="settings-value settings-value--caps">{profile.plan}</span>
          </SettingRow>
          <SettingRow
            label="Email verification"
            hint={
              profile.emailVerified
                ? "Verified — account recovery is available."
                : "Verify your email to secure account recovery."
            }
          >
            {profile.emailVerified ? (
              <span className="settings-status settings-status--success"><i aria-hidden="true" />Verified</span>
            ) : (
              <span className="settings-row-actions">
                <span className="settings-status settings-status--warn"><i aria-hidden="true" />Unverified</span>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => sendMessage(() => useAccountStore.getState().resendVerification())}
                >
                  Resend email
                </button>
              </span>
            )}
          </SettingRow>
        </div>
      </SettingsBlock>
      <SettingsBlock label="Profile">
        <div className="settings-group">
          <SettingRow label="Display name" hint="Shown in the title bar and on your devices.">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Display name" />
          </SettingRow>
          <SettingRow
            label="Email address"
            hint={emailEditable ? "Changing it sends a new verification email." : `Managed by ${providerDisplayName(profile.provider)}.`}
          >
            <input className="input" type="email" value={email} disabled={!emailEditable} onChange={(e) => setEmail(e.target.value)} aria-label="Email address" />
          </SettingRow>
          <div className="settings-group__foot">
            <span className={`settings-feedback ${feedback?.tone === "error" ? "settings-feedback--error" : ""}`} role="status" aria-live="polite">
              {feedback?.text}
            </span>
            <button className="btn btn--primary" disabled={!dirty || saving || busy} onClick={() => void save()}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </SettingsBlock>
      <ProfileSessionBlock profile={profile} emailEditable={emailEditable} onMessage={sendMessage} />
    </>
  );
}
