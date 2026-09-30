import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ProjectSpec } from '../../types';
import { useProjectStore } from '../../state/projectStore';
import { useSettingsStore } from '../../state/settingsStore';

interface Props {
  project: ProjectSpec;
  sessionCount: number;
  x: number;
  y: number;
  opener: HTMLButtonElement;
  onDismiss: () => void;
}

export function ProjectContextMenu({ project, sessionCount, x, y, opener, onDismiss }: Props) {
  const [mode, setMode] = useState<'menu' | 'rename' | 'close'>('menu');
  const [draft, setDraft] = useState(project.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const panel = useRef<HTMLDivElement>(null);
  const renameInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (mode === 'rename' ? renameInput.current : panel.current?.querySelector<HTMLButtonElement>('button'))?.focus();
  }, [mode]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node)) onDismiss();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onDismiss(); opener.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [onDismiss, opener]);

  async function rename() {
    const name = draft.trim();
    if (!name) { setError('Enter a project name.'); renameInput.current?.focus(); return; }
    if (name === project.name) { onDismiss(); opener.focus(); return; }
    setBusy(true);
    setError('');
    try {
      await useProjectStore.getState().rename(project.id, name);
      if (useSettingsStore.getState().saveState === 'error') throw new Error('Could not save the project name.');
      onDismiss(); opener.focus();
    } catch (cause) { setError(String(cause)); setBusy(false); }
  }

  async function close() {
    setBusy(true);
    setError('');
    try {
      await useProjectStore.getState().remove(project.id);
      if (useSettingsStore.getState().saveState === 'error') throw new Error('Could not save the project list.');
      onDismiss();
    } catch (cause) { setError(String(cause)); setBusy(false); }
  }

  const width = mode === 'menu' ? 228 : 292;
  const height = mode === 'menu' ? 126 : 218;
  const left = Math.max(8, Math.min(x, window.innerWidth - width - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - height - 8));
  return createPortal(<div ref={panel} className="project-context" style={{ left, top }} role="dialog" aria-label={`Project actions for ${project.name}`}>
    <div className="project-context__title" title={project.root}>{project.name}</div>
    {mode === 'menu' ? <div className="project-context__choices">
      <button type="button" onClick={() => setMode('rename')}>Rename project</button>
      <button type="button" className="project-context__danger" onClick={() => setMode('close')}>Close project</button>
    </div> : mode === 'rename' ? <form onSubmit={event => { event.preventDefault(); void rename(); }}>
      <label htmlFor="project-context-name">Project name</label>
      <input id="project-context-name" ref={renameInput} value={draft} onChange={event => setDraft(event.target.value)} onFocus={event => event.currentTarget.select()} disabled={busy} maxLength={120} />
      <p className="project-context__hint">The folder name stays the same.</p>
      {error && <p className="project-context__error" role="alert">{error}</p>}
      <div className="project-context__buttons"><button type="button" onClick={() => setMode('menu')} disabled={busy}>Cancel</button><button type="submit" className="project-context__primary" disabled={busy}>Save name</button></div>
    </form> : <div className="project-context__confirmation">
      <p className="project-context__hint">Remove this project from the sidebar. Its folder stays on disk{sessionCount ? `; ${sessionCount} open ${sessionCount === 1 ? 'session' : 'sessions'} will close` : ''}.</p>
      {error && <p className="project-context__error" role="alert">{error}</p>}
      <div className="project-context__buttons"><button type="button" onClick={() => setMode('menu')} disabled={busy}>Cancel</button><button type="button" className="project-context__confirm-danger" onClick={() => void close()} disabled={busy}>Close project</button></div>
    </div>}
  </div>, document.body);
}
