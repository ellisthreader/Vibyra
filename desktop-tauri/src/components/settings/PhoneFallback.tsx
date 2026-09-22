import { computerName } from "../../lib/platform";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import { phoneInvite } from "../../ipc/phone";
import { Disclosure } from "./SettingsControls";

const LIFETIME_MS = 120_000;

/** Bonjour is blocked on some guest and corporate Wi-Fi, and neither Expo Go
 * nor the web build can browse for services at all. The code stays available
 * for those phones, folded away so nobody types anything in the normal case. */
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
  const liveCode = invite && seconds > 0;
  return (
    <Disclosure title={`Can’t see this ${computerName} on your phone?`} summary="Pair with a code instead" open={open} onToggle={setOpen}>
      <div className="phone-fallback">
        <p className="phone-connection__hint">Some Wi-Fi networks block the announcement. A one-time code pairs the same way and still needs your approval here.</p>
        <div className="phone-connection__actions">
          <button className="btn btn--primary" type="button" disabled={!ready} onClick={() => void create()}>
            {invite ? "New code" : "Create code"}
          </button>
          {liveCode ? <span role="status">Expires in {seconds}s · single use</span> : null}
          {invite && seconds === 0 ? <span role="status">That code expired. Create another one.</span> : null}
        </div>
        {error && <p role="alert" className="phone-connection__error">{error}</p>}
        {liveCode && (
          <div className="phone-connection__invite">
            <QRCodeSVG value={invite} size={180} marginSize={4} title="Scan with the Vibyra phone app" />
            <button className="btn" type="button" onClick={() => { void navigator.clipboard.writeText(invite); setCopied(true); }}>
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        )}
      </div>
    </Disclosure>
  );
}
