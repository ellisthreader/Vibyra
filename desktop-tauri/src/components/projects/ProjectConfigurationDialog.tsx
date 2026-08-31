import { useCallback, useRef, useState } from "react";

import { abbreviateHome } from "../../lib/relativeTime";
import { PROJECT_COLORS } from "../../lib/projectIdentity";
import { useModalFocus } from "../../lib/useModalFocus";
import { useNotificationStore } from "../../state/notificationStore";
import { useProjectStore } from "../../state/projectStore";
import type { ProjectSpec } from "../../types";
import { CloseIcon } from "../common/Icons";

export function ProjectConfigurationDialog({ project, onClose }: { project: ProjectSpec; onClose: () => void }) {
  const modal = useRef<HTMLElement>(null);
  const homeDir = useProjectStore((state) => state.homeDir);
  const updateProject = useProjectStore((state) => state.updateProject);
  const [name, setName] = useState(project.name);
  const [color, setColor] = useState(project.color);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dismiss = useCallback(() => { if (!busy) onClose(); }, [busy, onClose]);
  useModalFocus(modal, true, dismiss);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await updateProject(project.id, { name: trimmed, color });
      useNotificationStore.getState().push({
        kind: "project", tier: "done", title: `${trimmed} configuration saved`, osEligible: false,
      });
      onClose();
    } catch (failure) {
      setError(String(failure));
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={dismiss}>
      <section ref={modal} className="modal project-config" role="dialog" aria-modal="true" aria-labelledby="project-config-title" onClick={(event) => event.stopPropagation()}>
        <header className="modal__header"><div className="modal__heading"><span className="project-kicker">PROJECT</span><h2 className="modal__title" id="project-config-title">Configuration</h2></div><button className="icon-btn" type="button" title="Cancel" disabled={busy} onClick={onClose}><CloseIcon size={15} /></button></header>
        <div className="project-config__body">
          <label className="project-config__field"><span>Display name</span><input data-autofocus maxLength={64} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <fieldset className="project-config__colours"><legend>Project colour</legend><div>{PROJECT_COLORS.map((value) => <button key={value} type="button" className={value === color ? "project-colour project-colour--selected" : "project-colour"} style={{ "--project-c": value } as React.CSSProperties} aria-label={`Use colour ${value}`} aria-pressed={value === color} onClick={() => setColor(value)} />)}</div></fieldset>
          <div className="project-config__path"><span>Folder</span><code>{abbreviateHome(project.root, homeDir)}</code><small>Configuration never moves or changes project files.</small></div>
          {error && <p className="project-config__error" role="alert">{error}</p>}
        </div>
        <footer className="project-config__actions"><button className="btn" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="btn btn--primary" type="button" disabled={busy || !name.trim() || (name.trim() === project.name && color === project.color)} onClick={() => void save()}>{busy ? "Saving…" : "Save changes"}</button></footer>
      </section>
    </div>
  );
}
