import { useCallback, useEffect, useRef } from 'react';
import { useAccountStore } from '../../state/accountStore';
import { usePhoneStore } from '../../state/phoneStore';
import { useRemoteSecurity } from '../../state/remoteSecurityStore';
import { useWorkspaceStore } from '../../state/workspaceStore';
import { permissionLabels } from '../../ipc/remoteSecurity';
import { useModalFocus } from '../../lib/useModalFocus';
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
    {phone?.remote?.enabled && snapshot?.security?.mode === 'disabled' && !shown && !active.length && <aside className="remote-active" aria-label="Remote access setup">
      <span>Finish remote access security setup</span>
      <button type="button" className="btn" onClick={() => useWorkspaceStore.getState().openSettingsSection('security')}>Open settings</button>
    </aside>}
    {active.length > 0 && <aside className="remote-active" aria-label="Active remote access">
      <span className="phone-dot phone-dot--on" aria-hidden="true" />
      <button type="button" className="btn btn--ghost" onClick={() => useWorkspaceStore.getState().openSettingsSection('security')}>
        Remote access active · {active.map(d => d.name).join(', ')}
      </button>
      <button type="button" className="btn" onClick={() => void usePhoneStore.getState().configure(false)}>Disconnect</button>
    </aside>}
    {shown && <div className="modal-backdrop">
      <section ref={dialog} className="modal phone-approval remote-security-approval" role="dialog" aria-modal="true" aria-labelledby="remote-approval-title">
        <header className="modal__header"><div className="modal__heading">
          <h2 className="modal__title" id="remote-approval-title">{request ? `Approve ${request.deviceName}?` : `${session?.clientName || 'Remote device'} wants to connect`}</h2>
          <p className="modal__subtitle">{request ? 'Match this code with the one on your device.' : 'Allow this connection to this computer?'}</p>
        </div></header>
        <div className="phone-approval__body"><div>
          {request && <p className="remote-pair-code">{request.pairingCode.slice(0, 3)} {request.pairingCode.slice(3)}</p>}
          {request?.lastIp && <p>IP address: {request.lastIp}</p>}
          <ul>{(request?.permissions ?? session?.permissions ?? []).map(p => <li key={p}>{permissionLabels[p] ?? p}</li>)}</ul>
          <p>{request ? 'Approve only a device you recognize. A passkey is also required before it connects.' : 'This device is approved and has verified a passkey. Allow only the access you need.'}</p>
          {error && <p role="alert">{error}</p>}
        </div></div>
        <footer className="phone-approval__actions">
          <button type="button" className="btn" disabled={busy} onClick={dismiss}>Deny</button>
          <button type="button" className="btn" disabled={busy} onClick={() => request ? void useRemoteSecurity.getState().decide(request, true) : session && void useRemoteSecurity.getState().decideSession(session, true)}>{request ? 'Approve' : 'Allow'}</button>
        </footer>
      </section>
    </div>}
  </>;
}
