import '../../styles/nativeWindowShare.css';
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { PreviewShareControl } from './PreviewShareControl';
import { computerName, isLinux, isMac } from '../../lib/platform';

/** What control needs beyond the window being in front, on this computer. */
const controlNote = isMac ? 'Mac Accessibility permission' : isLinux ? 'an X11 or XWayland window' : 'a window not running as administrator';

interface WindowInfo { id: number; pid: number; name: string; title: string }

/** Explicit attachment works for every framework, including packaged apps whose
 * process cwd cannot establish project ownership. No title-based auto-grants. */
export function NativeWindowShare({ projectId, root }: { projectId: string; root: string }) {
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [selected, setSelected] = useState('');
  const [control, setControl] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { void invoke<boolean>('preview_windows_available').then(setAvailable).catch(() => {}); }, []);
  const load = async (permission = false) => {
    setBusy(true); setError('');
    try {
      if (permission) await invoke('preview_windows_permission');
      const found = await invoke<WindowInfo[]>('preview_windows_list');
      setWindows(found);
      setSelected(current => found.some(window => String(window.id) === current) ? current : '');
    } catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  };
  const window = windows.find(item => String(item.id) === selected);
  if (!available) return null;
  return <details className="preview-share-control preview-native-share" open={open} onToggle={event => {
    const next = event.currentTarget.open;
    setOpen(next); if (next && !open) void load();
  }}>
    <summary>Preview a desktop application on your phone</summary>
    {open && <>
      <small>Select the running window for this project. Its actual interface will appear on your phone, regardless of framework.</small>
      <label>Application window <select aria-label="Application window" value={selected} disabled={busy}
        onChange={event => setSelected(event.target.value)}>
        <option value="">Choose a window…</option>
        {windows.map(item => <option key={item.id} value={item.id}>{item.name} — {item.title}</option>)}
      </select></label>
      <button className="btn" disabled={busy} onClick={() => void load()}>Refresh windows</button>
      <label>Permission when sharing <select value={control ? 'control' : 'view'} onChange={event => setControl(event.target.value === 'control')}>
        <option value="view">View only</option><option value="control">View, click and type</option>
      </select></label>
      <small>Choose Share below to apply this permission. It replaces this phone’s previous permission for the same window.</small>
      <small>Viewing shares this window only. Control also requires {controlNote} and the selected window in front. Closing Preview leaves the application running.</small>
      {error && <><small role="alert">{error}</small><button className="btn" disabled={busy} onClick={() => void load(true)}>{isMac ? 'Allow screen recording' : 'Try again'}</button></>}
      {!busy && !error && windows.length === 0 && <small>No shareable application windows. Open your app on the {computerName}, then refresh.</small>}
      {window && <PreviewShareControl key={`${window.id}:${control}`} projectId={projectId} root={root} target={{
        id: `native-window:${window.pid}:${window.id}:${control ? 'control' : 'view'}`,
        name: `${window.name} — ${window.title}`, framework: 'Native window', relativeRoot: '.', command: null,
        runnable: true, reason: null, deviceHint: 'desktop', landscape: true,
      }} />}
    </>}
  </details>;
}
