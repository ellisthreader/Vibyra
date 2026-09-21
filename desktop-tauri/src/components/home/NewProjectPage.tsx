import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { fsCreateProjectFolder } from '../../ipc/fs';
import { useProjectStore } from '../../state/projectStore';
import { flushSettings } from '../../state/settingsStore';
import { closeNewProject } from '../../state/newProject';
import { FolderIcon } from '../common/Icons';
import '../../styles/new-project.css';

export function NewProjectPage() {
  const home = useProjectStore(s => s.homeDir);
  const [name, setName] = useState('');
  const [parent, setParent] = useState(home);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Retain a successfully created folder if saving the project fails, so Retry
  // never creates another directory or mistakes an existing folder for ours.
  const [created, setCreated] = useState<string | null>(null);
  const trimmed = name.trim();
  const valid = Boolean(trimmed && !/[\\/:\x00-\x1f]/.test(trimmed) && !['.', '..'].includes(trimmed));
  const choose = async (existing = false) => {
    setBusy(true); setError('');
    try {
      const path = await open({ directory: true, multiple: false, defaultPath: parent,
        title: existing ? 'Open an existing project' : 'Choose where to create your project' });
      if (typeof path === 'string') {
        if (existing) await useProjectStore.getState().create(path);
        else setParent(path);
      }
    } catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  };
  const create = async () => {
    if (busy || !valid) return;
    setBusy(true); setError('');
    try {
      const path = created ?? await fsCreateProjectFolder(parent, trimmed);
      setCreated(path);
      if (created) await flushSettings();
      await useProjectStore.getState().create(path, trimmed);
    } catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  };
  return <main className="new-project-page">
    <form className="new-project-card" aria-label="New project" onSubmit={e => { e.preventDefault(); void create(); }}>
      <FolderIcon size={26} /><h1>New project</h1><p>A new folder for your next idea.</p>
      <label htmlFor="project-name">Project name</label>
      <input id="project-name" autoFocus autoComplete="off" placeholder="My next project" value={name}
        disabled={busy || Boolean(created)} onChange={e => setName(e.target.value)} />
      <label htmlFor="project-location">Location</label>
      <button id="project-location" type="button" className="new-project-location" disabled={busy || Boolean(created)} onClick={() => void choose()}>
        <span>{parent}</span><strong>Choose…</strong>
      </button>
      <small>{created ?? `${parent.replace(/[\\/]$/, '')}/${trimmed || 'My next project'}`}</small>
      {error && <p role="alert" className="new-project-error">{error}</p>}
      <footer><button type="button" className="btn" disabled={busy} onClick={closeNewProject}>Cancel</button>
        <button className="btn btn--primary" disabled={busy || !valid}>{busy ? 'Creating…' : created ? 'Retry opening project' : 'Create project'}</button></footer>
      <button className="new-project-existing" type="button" disabled={busy} onClick={() => void choose(true)}>Open an existing folder…</button>
    </form>
  </main>;
}
