import { useEffect, useState } from "react";

import { accountAvatar } from "../../ipc/account";
import { canEditEmail, providerDisplayName, validateProfileEdit } from "../../lib/accountPolicy";
import { monthAndYear } from "../../lib/membership";
import { useAccountStore } from "../../state/accountStore";
import type { AccountProfile } from "../../types";
import { StatusChip } from "./SettingsControls";
import { SettingRow, SettingsBlock } from "./SettingsShared";

/** Who is signed in, in one card. The edit form appears only when asked
 * for, and verification only when it still needs doing. */
export function AccountIdentityBlock({ profile }: { profile: AccountProfile }) {
  const busy = useAccountStore((s) => s.busy);
  const [photo, setPhoto] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(profile.name);
    setEmail(profile.email);
  }, [profile.name, profile.email]);
  useEffect(() => {
    if (!profile.hasAvatar) return setPhoto(null);
    let live = true;
    void accountAvatar()
      .then((data) => live && setPhoto(data))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [profile.hasAvatar, profile.email]);

  const emailEditable = canEditEmail(profile);
  const dirty = name !== profile.name || email !== profile.email;
  const initial = (profile.name || profile.email).trim().charAt(0).toUpperCase();
  const since = profile.createdAt ? `Member since ${monthAndYear(profile.createdAt)}` : null;

  const save = async () => {
    const problem = validateProfileEdit({ name, email });
    if (problem) return setFeedback({ tone: "error", text: problem });
    setSaving(true);
    const error = await useAccountStore.getState().updateProfile(name, email);
    setSaving(false);
    setFeedback(error ? { tone: "error", text: error } : { tone: "ok", text: "Profile saved." });
    if (!error) setEditing(false);
  };

  return (
    <SettingsBlock label="Account" panel="identity">
      <div className="settings-group">
        <div className="account-card">
          {photo ? (
            <img className="account-card__photo" src={photo} alt="" />
          ) : (
            <span className="account-card__avatar" aria-hidden="true">{initial}</span>
          )}
          <div className="account-card__text">
            <span className="account-card__name">{profile.name || profile.email}</span>
            <span className="account-card__meta">
              {profile.email} · {providerDisplayName(profile.provider)} account
            </span>
            {since && <span className="account-card__since">{since}</span>}
          </div>
          {!editing && (
            <button className="btn" onClick={() => { setFeedback(null); setEditing(true); }}>Edit</button>
          )}
        </div>
        {!profile.emailVerified && (
          <SettingRow label="Email not verified" hint="Verify your email to secure account recovery.">
            <StatusChip tone="warn">Action needed</StatusChip>
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                void useAccountStore
                  .getState()
                  .resendVerification()
                  .then((text) => setFeedback({ tone: "ok", text }))
              }
            >
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
              <input
                className="input"
                type="email"
                value={email}
                disabled={!emailEditable}
                onChange={(e) => setEmail(e.target.value)}
                aria-label="Email address"
              />
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
          <p className={`profile-feedback profile-feedback--row ${feedback.tone === "error" ? "profile-feedback--error" : ""}`} role="status">
            {feedback.text}
          </p>
        )}
      </div>
    </SettingsBlock>
  );
}
