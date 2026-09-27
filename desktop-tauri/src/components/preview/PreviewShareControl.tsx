import { useEffect, useState } from 'react';
import { previewShareAvailable, previewShareSet, previewShareStatus } from '../../ipc/preview';
import { usePhoneStore } from '../../state/phoneStore';
import type { PreviewTarget } from '../../previewTypes';
import type { PhoneDevice } from '../../ipc/phone';
const NO_DEVICES: PhoneDevice[] = [];

/** Visible only in the opt-in native Preview proof build. One explicit Mac
 * approval applies to one paired device, project/worktree, and target recipe. */
export function PreviewShareControl({ projectId, root, target, startPath }: {
  projectId: string; root: string; target: PreviewTarget; startPath?: string;
}) {
  const status = usePhoneStore(state => state.status);
  const devices = status?.devices ?? NO_DEVICES;
  const activeIds = new Set(status?.active ?? []);
  const orderedDevices = [...devices].sort((left, right) => {
    const active = Number(activeIds.has(right.id)) - Number(activeIds.has(left.id));
    return active || (right.lastSeen ?? '').localeCompare(left.lastSeen ?? '');
  });
  const [available, setAvailable] = useState(false);
  const [granted, setGranted] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    void previewShareAvailable().then(setAvailable).catch(() => setAvailable(false));
    void usePhoneStore.getState().refresh();
  }, []);
  useEffect(() => {
    if (!available) return;
    let live = true;
    setGranted({}); setError('');
    void Promise.all(devices.map(async device => {
      const scope = { deviceId: device.id, projectId, root, targetId: target.id, startPath };
      return [device.id, await previewShareStatus(scope)] as const;
    })).then(rows => { if (live) setGranted(Object.fromEntries(rows)); })
      .catch(cause => { if (live) setError(String(cause)); });
    return () => { live = false; };
  }, [available, devices, projectId, root, target.id, startPath]);
  if (!available || !target.runnable) return null;
  const attached = target.id.startsWith('attached-port:');
  const toggle = async (deviceId: string) => {
    const enabled = !granted[deviceId];
    setBusy(deviceId); setError('');
    try {
      await previewShareSet({ deviceId, projectId, root, targetId: target.id, startPath }, enabled);
      setGranted(current => ({ ...current, [deviceId]: enabled }));
    } catch (cause) { setError(String(cause)); }
    finally { setBusy(''); }
  };
  return <div className="preview-share-control">
    <strong>Live Preview on approved phones</strong>
    <small>{attached
      ? 'This grants your phone access to any service using this exact Mac port, including backend routes and cookies, until you stop sharing. Start or restart the server from your phone terminal; Vibyra will not control that process.'
      : 'Approved phones can start this target and open the site it serves, including local backend routes, cookies, and source maps.'}</small>
    <small>Folder: <code>{root}</code><br />Target: <code>{attached ? `Existing local server on port ${target.id.split(':')[1]}` : target.name}</code>{attached
      ? <><br />Open: <code>{startPath ?? '/'}</code></>
      : <><br />Run: <code>{target.command ?? 'Vibyra static server'}</code></>}</small>
    {devices.length === 0 ? <small>Pair a phone in Settings first.</small> : orderedDevices.map(device =>
      <button className="btn" type="button" key={device.id}
        disabled={busy !== '' || granted[device.id] === undefined}
        onClick={() => void toggle(device.id)}>
        {granted[device.id] ? 'Stop sharing with' : 'Share with'} {device.name}
        {' · '}{activeIds.has(device.id) ? 'connected now' : 'paired'}
        {' · '}{device.id.slice(-6)}
      </button>)}
    {error ? <small role="alert">{error}</small> : null}
  </div>;
}
