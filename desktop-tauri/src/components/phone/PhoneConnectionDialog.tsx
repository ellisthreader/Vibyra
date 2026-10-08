import { useEffect, useRef, useState } from "react";
import type { PhoneDevice } from "../../ipc/phone";
import { useModalFocus } from "../../lib/useModalFocus";
import { usePhoneStore } from "../../state/phoneStore";
import { useAccountStore } from "../../state/accountStore";
import { PhoneIcon } from "../common/Icons";
import { PhoneConnectionPermissions } from "./PhoneConnectionPermissions";
import { PhoneConnectionResult } from "./PhoneConnectionResult";
import { useConnectionMotion } from "./useConnectionMotion";
import "./phoneConnectionDialog.css";
import "./phoneConnectionMotion.css";

export function PhoneConnectionDialog({ request, hold, close }: { request: PhoneDevice; hold: () => void; close: () => void }) {
  const status = usePhoneStore((s) => s.status);
  const busy = usePhoneStore((s) => s.busy);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const account = useRef(useAccountStore.getState().snapshot.profile?.welcomeKey);
  const current = () => mounted.current && account.current === useAccountStore.getState().snapshot.profile?.welcomeKey;
  const working = useRef(false);
  const ref = useRef<HTMLElement>(null);
  const deny = useRef<HTMLButtonElement>(null);
  const typing = status?.typing === true;
  const preview = status?.previewAutoAvailable === true;
  const deviceName = request.name?.trim() || "iPhone";
  const pending = status?.pending.some((p) => p.id === request.id) === true;
  const dismiss = () => {
    // A completed receipt never owns the next connection.
    if (connected) { close(); return; }
    if (working.current || busy) return;
    if (!pending) close();
    else void decide(false);
  };
  useModalFocus(ref, true, dismiss);
  useEffect(() => {
    mounted.current = true; deny.current?.focus();
    usePhoneStore.setState({ approvalOpen: true });
    return () => { mounted.current = false; usePhoneStore.setState({ approvalOpen: false }); };
  }, []);
  useEffect(() => {
    // Do not let an unacknowledged success screen hide the next approval.
    if (connected && status?.pending.length) close();
  }, [connected, status?.pending.length, close]);
  const fadeRequest = useConnectionMotion(ref, connected);
  async function decide(approve: boolean) {
    if (!current() || working.current || busy) return;
    working.current = true; hold(); setConnecting(approve); setError("");
    const ok = await usePhoneStore.getState().answer(request.id, approve, approve && preview ? true : undefined);
    if (!current()) return;
    if (!ok) {
      working.current = false; setConnecting(false);
      setError(usePhoneStore.getState().error || "The connection couldn't be completed."); return;
    }
    if (!approve) { working.current = false; close(); return; }
    await fadeRequest();
    if (!current()) return;
    working.current = false; setConnecting(false);
    setConnected(true);
  }
  return <div className="modal-backdrop phone-connect-backdrop">
    <section ref={ref} className={`phone-connect${connected ? " phone-connect--connected" : ""}`}
      role="dialog" aria-modal="true" aria-labelledby="phone-connect-title" aria-describedby="phone-connect-name phone-connect-description">
      <header className="phone-connect__topbar" id="phone-connect-name">{deviceName}</header>
      {connected ? <PhoneConnectionResult onDone={dismiss} />
        : <div className="phone-connect__request" aria-busy={connecting || busy}>
          <header className="phone-connect__header"><span className="phone-connect__device"><PhoneIcon size={23} /><i /></span>
            <div><h2 id="phone-connect-title">Connect your iPhone?</h2><p>Requesting access to your computer</p></div></header>
          <p className="phone-connect__intro" id="phone-connect-description">Only allow a phone you recognise.</p>
          <PhoneConnectionPermissions typing={typing} preview={preview} />
          <details className="phone-connect__details"><summary tabIndex={0}>Device details <span>›</span></summary>
            <div><span>{request.name}</span><code>{request.id.match(/.{1,4}/g)?.join(" ")}</code></div></details>
          {error && <p className="phone-connect__error" role="alert">{error}</p>}
          {!pending && !connecting && !error && <p className="phone-connect__error" role="status">This request has expired. Connect again from your iPhone.</p>}
          <footer className="phone-connect__actions">
            <button ref={deny} className="btn" disabled={busy || connecting} onClick={dismiss}>{pending ? "Deny" : "Close"}</button>
            <button className="btn btn--primary" disabled={busy || connecting || !pending}
              onClick={() => void decide(true)}>{connecting ? "Connecting…" : typing ? "Allow connection" : "Allow viewing"}</button>
          </footer>
          <p className="phone-connect__note">Manage access anytime in Phone settings.</p>
        </div>}
    </section>
  </div>;
}
