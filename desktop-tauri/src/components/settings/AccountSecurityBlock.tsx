import { useCallback, useEffect, useState } from "react";

import {
  accountProviderSecurity,
  twoFactorDisable,
  twoFactorReplaceRecoveryCodes,
  twoFactorStatus,
} from "../../ipc/accountSecurity";
import { canEditEmail, providerDisplayName } from "../../lib/accountPolicy";
import { useAccountStore } from "../../state/accountStore";
import type { AccountProfile, TwoFactorState } from "../../types";
import { RecoveryCodes } from "./AccountRecoveryCodes";
import { AccountTwoFactorSetup } from "./AccountTwoFactorSetup";
import { StatusChip } from "./SettingsControls";
import { SettingRow, SettingsBlock } from "./SettingsShared";

type Mode = "idle" | "setup" | "disable" | "recovery";

/** The password, and the second step. Turning the second step off takes the
 * same proof turning it on did: a password is exactly what it exists to
 * survive. */
export function AccountSecurityBlock({ profile }: { profile: AccountProfile }) {
  const busy = useAccountStore((s) => s.busy);
  const [state, setState] = useState<TwoFactorState | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [working, setWorking] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const [unreadable, setUnreadable] = useState<string | null>(null);
  const load = useCallback(() => {
    setUnreadable(null);
    void twoFactorStatus()
      .then(setState)
      .catch((cause) => {
        setState(null);
        setUnreadable(String(cause));
      });
  }, []);
  useEffect(load, [load]);

  const emailAccount = canEditEmail(profile);
  const reset = () => {
    setMode("idle");
    setCode("");
    setWorking(false);
  };
  const run = async (action: () => Promise<void>) => {
    setWorking(true);
    setFeedback(null);
    try {
      await action();
    } catch (cause) {
      setFeedback({ tone: "error", text: String(cause) });
    } finally {
      setWorking(false);
    }
  };

  return (
    <SettingsBlock label="Password and security" panel="security">
      <div className="settings-group">
        {emailAccount ? (
          <SettingRow label="Reset password" hint="We’ll email you a link.">
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                void useAccountStore
                  .getState()
                  .forgotPassword(profile.email)
                  .then((text) => setFeedback({ tone: "ok", text }))
              }
            >
              Send reset link
            </button>
          </SettingRow>
        ) : null}
        {!state && unreadable && (
          <SettingRow label="Two-factor authentication" hint={unreadable}>
            <button className="btn" onClick={load}>Try again</button>
          </SettingRow>
        )}
        {state && !state.available && (
          <SettingRow
            label="Two-factor authentication"
            hint={`This account signs in with ${providerDisplayName(profile.provider)}, so its second step belongs to ${providerDisplayName(profile.provider)}. Two-factor verification turned on there guards your Vibyra account too.`}
          >
            <button className="btn" onClick={() => void accountProviderSecurity(profile.provider)}>
              {profile.provider === "apple" ? "Manage" : "Set up"} at {providerDisplayName(profile.provider)}
            </button>
          </SettingRow>
        )}
        {state?.available && (
          <SettingRow
            label="Two-factor authentication"
            hint={
              state.enabled
                ? `A code from your authenticator app as well as your password. ${state.recoveryCodesLeft} recovery ${state.recoveryCodesLeft === 1 ? "code" : "codes"} left.`
                : "Ask for a code from an authenticator app as well as your password."
            }
            stack={mode !== "idle"}
          >
            {mode === "idle" && (
              <>
                <StatusChip tone={state.enabled ? "on" : "off"}>{state.enabled ? "On" : "Off"}</StatusChip>
                {state.enabled ? (
                  <>
                    <button className="btn" onClick={() => { setMode("recovery"); setCodes(null); }}>New codes</button>
                    <button className="btn btn--danger" onClick={() => setMode("disable")}>Turn off</button>
                  </>
                ) : (
                  <button className="btn btn--primary" onClick={() => setMode("setup")}>Set up</button>
                )}
              </>
            )}
            {mode === "setup" && (
              <AccountTwoFactorSetup
                onDone={(enabled) => {
                  reset();
                  if (enabled) {
                    load();
                    setFeedback({ tone: "ok", text: "Two-factor authentication is on." });
                  }
                }}
              />
            )}
            {(mode === "disable" || mode === "recovery") && !codes && (
              <div className="two-factor">
                <p className="two-factor__lead">
                  {mode === "disable"
                    ? "Enter a code from your authenticator app, or one of your recovery codes."
                    : "Enter a current code to replace your recovery codes. The old ones stop working."}
                </p>
                <div className="two-factor__confirm">
                  <input
                    className="input"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="Code"
                    autoComplete="one-time-code"
                    aria-label="Code from your authenticator app"
                  />
                  <button className="btn" disabled={working} onClick={reset}>Cancel</button>
                  <button
                    className={`btn ${mode === "disable" ? "profile-logout" : "btn--primary"}`}
                    disabled={working || !code.trim()}
                    onClick={() =>
                      void run(async () => {
                        if (mode === "disable") {
                          await twoFactorDisable(code);
                          reset();
                          load();
                          setFeedback({ tone: "ok", text: "Two-factor authentication is off." });
                        } else {
                          setCodes(await twoFactorReplaceRecoveryCodes(code));
                          setCode("");
                          load();
                        }
                      })
                    }
                  >
                    {working ? "Checking…" : mode === "disable" ? "Turn off" : "Replace codes"}
                  </button>
                </div>
              </div>
            )}
            {mode === "recovery" && codes && (
              <div className="two-factor">
                <RecoveryCodes codes={codes} onDone={() => { setCodes(null); reset(); }} />
              </div>
            )}
          </SettingRow>
        )}
        {feedback?.text && (
          <p className={`profile-feedback profile-feedback--row ${feedback.tone === "error" ? "profile-feedback--error" : ""}`} role="status">
            {feedback.text}
          </p>
        )}
      </div>
    </SettingsBlock>
  );
}
