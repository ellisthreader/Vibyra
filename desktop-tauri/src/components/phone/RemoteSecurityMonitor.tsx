import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useAccountStore } from '../../state/accountStore';
import { usePhoneStore } from '../../state/phoneStore';
import { useRemoteSecurity } from '../../state/remoteSecurityStore';
import { useWorkspaceStore } from '../../state/workspaceStore';
import { permissionLabels } from '../../ipc/remoteSecurity';
import { useModalFocus } from '../../lib/useModalFocus';
import { CheckIcon, LinkIcon, PhoneIcon } from '../common/Icons';
import { markFor } from '../notifications/notificationMarks';
import '../../styles/remote-security.css';

export function RemoteSecurityMonitor() {
  const account = useAccountStore(s => s.snapshot.profile?.welcomeKey);
  const phone = usePhoneStore(s => s.status);
  const snapshot = useRemoteSecurity(s => s.snapshot);
  const busy = useRemoteSecurity(s => s.busy);
  const error = useRemoteSecurity(s => s.error);
  const request = snapshot?.pendingDevices[0];
  const session = !request ? snapshot?.pendingSessions[0] : undefined;
  const shown = (request || session) && !phone?.pending.length;
  const dismiss = useCallback(() => {
    const store = useRemoteSecurity.getState();
    if (request) void store.decide(request, false);
    else if (session) void store.decideSession(session, false);
  }, [request, session]);
  const dialog = useRef<HTMLElement>(null);
  useModalFocus(dialog, !!shown, dismiss);
  useEffect(() => {
    useRemoteSecurity.getState().reset();
    if (!account) return;
    void useRemoteSecurity.getState().refresh();
    const timer = window.setInterval(() => void useRemoteSecurity.getState().refresh(), 5000);
    return () => { clearInterval(timer); useRemoteSecurity.getState().reset(); };
  }, [account]);
  const active = (phone?.devices ?? []).filter(d => phone?.active.includes(d.id));
  return <>
    {phone?.remote?.enabled && snapshot?.security?.mode === 'disabled' && !shown && !active.length && <CornerStatus
      label="Remote access setup" severity="warning" title="Finish remote access setup"
      body="Turn on security for remote connections before a phone can reach this computer from anywhere.">
      <button type="button" className="chip vtoast__action" onClick={() => useWorkspaceStore.getState().openSettingsSection('security')}>Open settings</button>
    </CornerStatus>}
    {active.length > 0 && <CornerStatus
      label="Active remote access" severity="success" title="Remote access active"
      body={`${active.map(d => d.name).join(', ')} ${active.length === 1 ? 'is' : 'are'} connected to this computer.`}>
      <button type="button" className="chip vtoast__action" onClick={() => useWorkspaceStore.getState().openSettingsSection('security')}>Manage</button>
      <button type="button" className="chip vtoast__action vtoast__action--danger" onClick={() => void usePhoneStore.getState().configure(false)}>Disconnect</button>
    </CornerStatus>}
    {shown && <div className="modal-backdrop">
      <section ref={dialog} className="modal decision remote-security-approval" role="dialog" aria-modal="true" aria-labelledby="remote-approval-title" aria-describedby="remote-approval-lead">
        <div className="decision__top">
          <span className="decision__mark"><span className="decision__mark-icon"><LinkIcon size={14} /></span>Remote access</span>
        </div>
        <div className="decision__content">
          <h2 className="decision__title" id="remote-approval-title">{request ? `Approve ${request.deviceName}?` : `${session?.clientName || 'Remote device'} wants to connect`}</h2>
          <p className="decision__lead" id="remote-approval-lead">{request ? 'Match this code with the one on your device.' : 'Allow this connection to this computer?'}</p>
          <div className="decision__card">
            {request && <p className="decision__code remote-pair-code" aria-label={`Pairing code ${request.pairingCode}`}>{request.pairingCode.slice(0, 3)} {request.pairingCode.slice(3)}</p>}
            {request?.lastIp && <div className="decision__who">
              <span className="decision__who-icon" aria-hidden="true"><PhoneIcon size={18} /></span>
              <div><strong>{request.deviceName}</strong><span>IP address: {request.lastIp}</span></div>
            </div>}
            {(request?.permissions ?? session?.permissions ?? []).map(p => <div className="decision__row" key={p}>
              <span className="decision__tick" aria-hidden="true"><CheckIcon size={12} /></span><span>{permissionLabels[p] ?? p}</span>
            </div>)}
          </div>
          <p className="decision__note">{request ? 'Approve only a device you recognize. A passkey is also required before it connects.' : 'This device is approved and has verified a passkey. Allow only the access you need.'}</p>
          {error && <p className="decision__error" role="alert">{error}</p>}
        </div>
        <footer className="decision__actions">
          <button type="button" className="btn" disabled={busy} onClick={dismiss}>Deny</button>
          <button type="button" className="btn" disabled={busy} onClick={() => request ? void useRemoteSecurity.getState().decide(request, true) : session && void useRemoteSecurity.getState().decideSession(session, true)}>{request ? 'Approve' : 'Allow'}</button>
        </footer>
      </section>
    </div>}
  </>;
}

/** A standing status in the notification corner: the toast's own card, with no
 * timer and no dismiss, because it lasts exactly as long as the state it
 * reports. It publishes its height (plus the stack gap) so toasts stack above it, never over it. */
function CornerStatus({ label, severity, title, body, children }: {
  label: string; severity: 'success' | 'warning'; title: string; body: string; children: ReactNode;
}) {
  const card = useRef<HTMLElement>(null);
  const mark = markFor(severity);
  useLayoutEffect(() => {
    const node = card.current;
    if (!node) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty('--corner-status-height', `${node.offsetHeight + 8}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(node);
    return () => { observer.disconnect(); root.style.removeProperty('--corner-status-height'); };
  }, []);
  return <aside ref={card} className={`vtoast vtoast--${severity} corner-status`} role="status" aria-label={label}>
    <span className={`${mark.className} nmark--sm vtoast__mark`}><mark.Icon size={12} /></span>
    <div className="vtoast__text">
      <div className="vtoast__head"><h3>{title}</h3></div>
      <p className="vtoast__body">{body}</p>
      <div className="vtoast__actions">{children}</div>
    </div>
  </aside>;
}
