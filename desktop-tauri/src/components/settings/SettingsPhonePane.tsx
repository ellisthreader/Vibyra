import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { invoke } from "@tauri-apps/api/core";
import { SettingRow, SettingsBlock } from "./SettingsShared";
import "../../styles/phone-connection.css";

type Device = { id: string; name: string };
type Status = { enabled: boolean; address: string; error: string | null; devices: Device[]; pending: Device[]; active: string[] };

export function SettingsPhonePane() {
  const [status, setStatus] = useState<Status | null>(null);
  const [address, setAddress] = useState("");
  const [invite, setInvite] = useState("");
  const [expires, setExpires] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const next = await invoke<Status>("phone_status");
        if (active) { setStatus(next); setAddress(value => value || next.address); }
      } catch (cause) { if (active) setError(String(cause)); }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1500);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    const tick = () => setSeconds(Math.max(0, Math.ceil((expires - Date.now()) / 1000)));
    tick(); const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [expires]);
  const action = async (task: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setError("");
    try { await task(); setStatus(await invoke<Status>("phone_status")); }
    catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  };
  return <div className="phone-connection">
    <SettingsBlock label="Live desktop terminals">
      <div className="settings-group">
        <SettingRow label={status?.enabled ? "Ready to connect" : "Connect your iPhone"}
          hint="View your Mac's live terminals in the Vibyra iOS app. Pairing is encrypted and requires approval here.">
          <button className={`btn ${status?.enabled ? "" : "btn--primary"}`} disabled={busy || !status}
            onClick={() => void action(async () => {
              await invoke("phone_configure", { enabled: !status?.enabled, address });
              setInvite(""); setExpires(0);
            })}>{status?.enabled ? "Turn off" : "Enable connection"}</button>
        </SettingRow>
        <SettingRow label="Mac network address" hint="Use the same Wi-Fi or your private VPN. Keep this Mac awake with Vibyra running." stack>
          <input className="input" aria-label="Mac network address" value={address} disabled={status?.enabled || busy}
            placeholder="192.168.1.20" onChange={e => setAddress(e.target.value)} spellCheck={false} />
        </SettingRow>
      </div>
    </SettingsBlock>
    {(error || status?.error) && <p role="alert" className="phone-connection__error">{error || status?.error}</p>}
    {status?.enabled && <>
      <SettingsBlock label="Pair a phone">
        <p className="phone-connection__hint">In the iOS app, open Computers → Connect a computer and scan the QR code or paste the pairing link. Then approve the request below.</p>
        <p className="phone-connection__hint">Approved phones can view all current and future terminal output, including anything sensitive printed there. This connection cannot send commands or browse files.</p>
        <button className="btn btn--primary" disabled={busy} onClick={() => void action(async () => {
          setInvite(await invoke<string>("phone_invite")); setExpires(Date.now() + 120000); setCopied(false);
        })}>{invite ? "Create new pairing link" : "Create pairing link"}</button>
        {invite && seconds > 0 && <div className="phone-connection__invite">
          <QRCodeSVG value={invite} size={220} marginSize={4} title="Scan with the Vibyra iPhone app" />
          <textarea className="input" aria-label="Pairing link" readOnly value={invite} rows={3} onFocus={e => e.target.select()} />
          <div className="phone-connection__actions">
            <button className="btn" onClick={() => void action(async () => { await navigator.clipboard.writeText(invite); setCopied(true); })}>{copied ? "Copied" : "Copy link"}</button>
            <span role="status">Expires in {seconds}s · Single use</span>
          </div>
        </div>}
        {invite && seconds === 0 && <p role="status">Pairing link expired. Create a new one to connect.</p>}
        {status.pending.map(device => <div className="phone-connection__device" key={device.id}>
          <div><strong>{device.name} wants to connect</strong><p className="phone-connection__key">Device key: {device.id}</p></div>
          <div className="phone-connection__actions">
            <button className="btn" disabled={busy} onClick={() => void action(() => invoke("phone_answer", { id: device.id, approve: false }))}>Deny</button>
            <button className="btn btn--primary" disabled={busy} onClick={() => void action(async () => { await invoke("phone_answer", { id: device.id, approve: true }); setInvite(""); })}>Approve viewing</button>
          </div>
        </div>)}
      </SettingsBlock>
      <SettingsBlock label="Trusted phones">
        {!status.devices.length && <p className="phone-connection__hint">No phones paired yet.</p>}
        {status.devices.map(device => <div className="phone-connection__device" key={device.id}>
          <div><strong>{device.name}</strong><p className="phone-connection__hint">{status.active.includes(device.id) ? "Connected · View only" : "Paired · Offline"}</p></div>
          <button className="btn" disabled={busy} onClick={() => void action(() => invoke("phone_revoke", { id: device.id }))}>Revoke</button>
        </div>)}
      </SettingsBlock>
    </>}
  </div>;
}
