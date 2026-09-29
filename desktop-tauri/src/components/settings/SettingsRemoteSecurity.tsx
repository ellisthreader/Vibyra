import { useEffect } from 'react';
import { usePhoneStore } from '../../state/phoneStore';
import { useRemoteSecurity } from '../../state/remoteSecurityStore';
import { permissionLabels, type RemoteMode } from '../../ipc/remoteSecurity';
import { SettingsBlock, SettingRow } from './SettingsShared';

export function SettingsRemoteSecurity() {
  const phone = usePhoneStore(s => s.status);
  const phoneBusy = usePhoneStore(s => s.busy);
  const phoneError = usePhoneStore(s => s.error);
  const { snapshot, error, busy } = useRemoteSecurity();
  useEffect(() => { void useRemoteSecurity.getState().refresh(); }, []);
  const devices = snapshot?.devices.filter(d => !d.revokedAt) ?? [];
  const sessions = snapshot?.sessions.filter(s => ['CONNECTING', 'CONNECTED', 'AUTHORIZED'].includes(s.status)) ?? [];
  const nearby = phone?.devices.filter(d => d.lastRoute === 'nearby' && phone.active.includes(d.id)) ?? [];
  return <div>
    <SettingsBlock label="Remote access">
      <div className="settings-group">
        <SettingRow label={snapshot?.computer?.name || "This computer"} hint={phone?.enabled && phone?.remote?.enabled && snapshot?.security?.enabled ? 'Remote access is on.' : 'Remote access is off. Start sharing, then choose an approval mode.'}>
          {phone?.enabled && phone.remote?.enabled ? <span>{phone.remote.leg?.state === 'online' ? 'Online' : 'Connecting…'}</span> : <button type="button" className="btn" disabled={busy}
            onClick={async () => { await usePhoneStore.getState().configure(true); await usePhoneStore.getState().setRemote(true); await useRemoteSecurity.getState().refresh(); }}>Start sharing</button>}
        </SettingRow>
        <SettingRow label="Remote access mode" hint={phone?.securitySyncPending
          ? 'Nearby connections require approval while security settings are being checked.'
          : 'New devices always need approval on this computer.'}>
          <select className="input" aria-label="Remote access mode" disabled={busy || !snapshot?.security || !phone?.enabled}
            value={snapshot?.security?.mode ?? 'disabled'} onChange={e => void useRemoteSecurity.getState().setMode(e.target.value as RemoteMode)}>
            <option value="disabled">Disabled</option><option value="ask">Ask every time</option><option value="trusted">Trusted devices</option>
          </select>
        </SettingRow>
        <SettingRow label="Strong authentication" hint="A recent passkey verification is required for every new remote authorization.">Required</SettingRow>
      </div>
      {(error || phoneError) && <p className="phone-connection__error" role="alert">{error || phoneError}</p>}
    </SettingsBlock>
    <SettingsBlock label="Trusted devices">
      <div className="settings-group">{devices.length ? devices.map(d => <SettingRow key={d.id} label={d.deviceName}
        hint={`${d.approvedAt ? 'Approved' : 'Awaiting approval'} · ${d.permissions.map(p => permissionLabels[p] ?? p).join(', ')}${d.lastSeenAt ? ` · Last seen ${new Date(d.lastSeenAt).toLocaleString()}` : ''}`}>
        <button type="button" className="btn" disabled={busy} onClick={() => void useRemoteSecurity.getState().revoke('device', d.id)}>Revoke</button>
      </SettingRow>) : <SettingRow label="No trusted remote devices" />}</div>
    </SettingsBlock>
    <SettingsBlock label="Active sessions">
      <div className="settings-group">{sessions.map(s => <SettingRow key={s.id} label={s.clientName || 'Remote device'}
        hint={`${s.status === 'CONNECTED' ? 'Connected' : 'Connecting'}${s.connectedAt ? ` · ${new Date(s.connectedAt).toLocaleTimeString()}` : ''}`}>
        <button type="button" className="btn" disabled={busy} onClick={() => void useRemoteSecurity.getState().revoke('session', s.id)}>Disconnect</button>
      </SettingRow>)}
      {nearby.map(d => <SettingRow key={`nearby-${d.id}`} label={d.name} hint="Nearby on this computer">
        <button type="button" className="btn" disabled={phoneBusy} onClick={() => void usePhoneStore.getState().disconnectDevice(d.id)}>Disconnect</button>
      </SettingRow>)}
      {!sessions.length && !nearby.length && <SettingRow label="No active sessions" />}</div>
    </SettingsBlock>
    <SettingsBlock label="Passkeys"><div className="settings-group">
      {(snapshot?.passkeys ?? []).map(key => <SettingRow key={key.id} label={key.device_name} hint="Removing a passkey disconnects active remote sessions.">
        <button type="button" className="btn" disabled={busy} onClick={() => void useRemoteSecurity.getState().revoke('passkey', String(key.id))}>Remove passkey</button>
      </SettingRow>)}
      {!snapshot?.passkeys?.length && <SettingRow label="No passkeys yet" hint="Approve your device, then create a passkey when connecting from it." />}
    </div></SettingsBlock>
    <SettingsBlock label="Recent activity"><div className="settings-group">
      {(snapshot?.events ?? []).slice(0, 10).map((event, i) => <SettingRow key={event.id || String(i)} label={event.title}
        hint={`${event.metadata.device || event.metadata.client || event.metadata.computer || ''} · ${new Date(event.createdAt).toLocaleString()}`} />)}
      {!snapshot?.events.length && <SettingRow label="No remote security activity yet" />}
    </div></SettingsBlock>
    <SettingsBlock><SettingRow label="Disable all remote access" danger hint="Stop sharing on all your computers. Offline computers receive the change when they reconnect.">
      <button type="button" className="btn" disabled={busy || !snapshot} onClick={() => void useRemoteSecurity.getState().disableAll()}>Disable all</button>
    </SettingRow></SettingsBlock>
    {devices.length > 0 && <SettingsBlock><SettingRow label="Revoke all trusted remote devices" danger hint="Every remote device will need approval again. Offline computers receive the change when they reconnect.">
      <button type="button" className="btn" disabled={busy} onClick={() => void useRemoteSecurity.getState().revoke('devices')}>Revoke all</button>
    </SettingRow></SettingsBlock>}
  </div>;
}
