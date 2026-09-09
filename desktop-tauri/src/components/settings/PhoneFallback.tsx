import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import { SettingsBlock } from "./SettingsShared";
import { phoneInvite } from "../../ipc/phone";

const LIFETIME_MS = 120_000;

/** Bonjour is blocked on some guest and corporate Wi-Fi, and neither Expo Go
 * nor the web build can browse for services at all. The code stays available
 * for those phones, tucked away so nobody types anything in the normal case. */
export function PhoneFallback({ ready }: { ready: boolean }) {
  const [open, setOpen] = useState(false);
  const [invite, setInvite] = useState("");
  const [expires, setExpires] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const tick = () => setSeconds(Math.max(0, Math.ceil((expires - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [expires]);
  const create = async () => {
    setError("");
    try {
      setInvite(await phoneInvite());
      setExpires(Date.now() + LIFETIME_MS);
      setCopied(false);
    } catch (cause) {
      setError(String(cause));
    }
  };
  return <SettingsBlock label="If your phone cannot find this Mac">
    <p className="phone-connection__hint">
      Some Wi-Fi networks block the announcement. A one-time code pairs the same way.
    </p>
    {!open
      ? <button className="btn" type="button" disabled={!ready} onClick={() => setOpen(true)}>
        Show a pairing code
      </button>
      : <>
        <button className="btn btn--primary" type="button" onClick={() => void create()}>
          {invite ? "New code" : "Create code"}
        </button>
        {error && <p role="alert" className="phone-connection__error">{error}</p>}
        {invite && seconds > 0 && <div className="phone-connection__invite">
          <QRCodeSVG value={invite} size={200} marginSize={4} title="Scan with the Vibyra iPhone app" />
          <textarea className="input" aria-label="Pairing link" readOnly value={invite} rows={3}
            onFocus={(event) => event.target.select()} />
          <div className="phone-connection__actions">
            <button className="btn" type="button" onClick={() => {
              void navigator.clipboard.writeText(invite);
              setCopied(true);
            }}>{copied ? "Copied" : "Copy link"}</button>
            <span role="status">Expires in {seconds}s · Single use · Still needs your approval</span>
          </div>
        </div>}
        {invite && seconds === 0 && <p role="status" className="phone-connection__hint">
          That code expired. Create another one.
        </p>}
      </>}
  </SettingsBlock>;
}
