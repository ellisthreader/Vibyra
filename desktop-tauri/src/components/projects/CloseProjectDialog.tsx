import { useCallback, useRef, useState } from "react";

import { useModalFocus } from "../../lib/useModalFocus";
import { useNotificationStore } from "../../state/notificationStore";
import { useProjectStore } from "../../state/projectStore";
import { useTerminalStore } from "../../state/terminalStore";
import type { ProjectSpec } from "../../types";
import { CheckIcon, CloseIcon } from "../common/Icons";

export function CloseProjectDialog({ project, onClose }: { project: ProjectSpec; onClose: () => void }) {
  const modal = useRef<HTMLElement>(null);
  const remove = useProjectStore((state) => state.remove);
  const terminals = useTerminalStore((state) => state.panes.filter((pane) => pane.projectId === project.id).length);
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dismiss = useCallback(() => { if (!busy) onClose(); }, [busy, onClose]);
  useModalFocus(modal, true, dismiss);

  const finish = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await remove(project.id);
      useNotificationStore.getState().push({
        kind: "project",
        tier: "done",
        title: `${project.name} closed`,
        body: "Your project folder was not deleted.",
        osEligible: false,
      });
      onClose();
    } catch (failure) {
      setError(String(failure));
      setBusy(false);
    }
  };

  const terminalCopy = `${terminals} terminal${terminals === 1 ? "" : "s"}`;
  return (
    <div className="modal-backdrop" onClick={dismiss}>
      <section ref={modal} className="modal project-close" role="dialog" aria-modal="true" aria-labelledby="project-close-title" onClick={(event) => event.stopPropagation()}>
        <div className="project-close__steps" aria-label={`Step ${step} of 2`}><i className="project-close__step project-close__step--active" /><i className={`project-close__step ${step === 2 ? "project-close__step--active" : ""}`} /><small>Step {step} of 2</small></div>
        <span className="project-close__symbol"><CloseIcon size={20} /></span>
        <h2 id="project-close-title">{step === 1 ? `Close ${project.name}?` : "Close it now?"}</h2>
        <p>{step === 1 ? `This removes the project from Vibyra, stops its preview, and closes ${terminalCopy}.` : `${project.name} can be added back later, but its Vibyra sessions will close now.`}</p>
        <div className="project-close__safe"><CheckIcon size={13} /><strong>Your project folder and files will not be deleted.</strong></div>
        {error && <p className="project-close__error" role="alert">{error}</p>}
        <footer className="project-close__actions"><button className="btn" type="button" disabled={busy} onClick={onClose}>Cancel</button>{step === 1 ? <button data-autofocus className="btn btn--danger" type="button" onClick={() => setStep(2)}>Continue</button> : <button data-autofocus className="btn btn--danger" type="button" disabled={busy} onClick={() => void finish()}>{busy ? "Closing…" : "Close project"}</button>}</footer>
      </section>
    </div>
  );
}
