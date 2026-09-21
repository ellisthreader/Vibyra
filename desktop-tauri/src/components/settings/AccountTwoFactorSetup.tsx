import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import { twoFactorConfirm, twoFactorStart } from "../../ipc/accountSecurity";
import type { TwoFactorSetup } from "../../types";
import { RecoveryCodes } from "./AccountRecoveryCodes";

/** Turning the second step on: scan or type the secret, then prove the app
 * and this server agree by entering the first code. The secret leaves the
 * server exactly once — here — and is never shown again. */
export function AccountTwoFactorSetup({ onDone }: { onDone: (enabled: boolean) => void }) {
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void twoFactorStart()
      .then((value) => live && setSetup(value))
      .catch((cause) => live && setError(String(cause)));
    return () => {
      live = false;
    };
  }, []);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      setCodes(await twoFactorConfirm(code));
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  if (codes) {
    return (
      <div className="two-factor">
        <RecoveryCodes codes={codes} onDone={() => onDone(true)} />
      </div>
    );
  }

  return (
    <div className="two-factor">
      {error && !setup && <p className="profile-feedback profile-feedback--error">{error}</p>}
      {setup && (
        <>
          <div className="two-factor__pair">
            <div className="two-factor__qr">
              <QRCodeSVG value={setup.uri} size={132} marginSize={2} />
            </div>
            <div className="two-factor__steps">
              <p>Scan this with your authenticator app, or type the key into it.</p>
              <code className="two-factor__secret">{setup.secret}</code>
              <p className="two-factor__account">{setup.account}</p>
            </div>
          </div>
          <div className="two-factor__confirm">
            <input
              className="input"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="6-digit code"
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="Code from your authenticator app"
              onKeyDown={(event) => {
                if (event.key === "Enter" && code.trim() && !busy) void confirm();
              }}
            />
            <button className="btn" disabled={busy} onClick={() => onDone(false)}>Cancel</button>
            <button className="btn btn--primary" disabled={busy || !code.trim()} onClick={() => void confirm()}>
              {busy ? "Checking…" : "Turn on"}
            </button>
          </div>
          {error && <p className="profile-feedback profile-feedback--error">{error}</p>}
        </>
      )}
    </div>
  );
}
