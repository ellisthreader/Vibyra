import { useCallback, useRef } from "react";
import { createPortal } from "react-dom";

import { useModalFocus } from "../../../lib/useModalFocus";
import { RAIL } from "../../../lib/projectCreateFlow";
import type { CreateStep } from "../../../lib/projectCreateFlow";
import { useProjectCreateStore } from "../../../state/projectCreateStore";
import { ChevronIcon, CloseIcon } from "../../common/Icons";
import { DestinationStep } from "./DestinationStep";
import { KindStep } from "./KindStep";
import { OptionsStep } from "./OptionsStep";
import { ReviewStep } from "./ReviewStep";
import { ScaffoldRunView } from "./ScaffoldRunView";
import { StackStep } from "./StackStep";
import { StartChoiceStep } from "./StartChoiceStep";

const TITLES: Record<CreateStep, string> = {
  start: "Start a project",
  kind: "What are you making?",
  stack: "Which stack?",
  options: "How should it be set up?",
  where: "Name it and place it",
  review: "Ready when you are",
  running: "Building your project",
};

export function NewProjectDialog() {
  const modal = useRef<HTMLElement>(null);
  const step = useProjectCreateStore((state) => state.step);
  const phase = useProjectCreateStore((state) => state.phase);
  const canBack = useProjectCreateStore((state) => state.history.length > 0);
  const back = useProjectCreateStore((state) => state.back);
  const close = useProjectCreateStore((state) => state.close);
  const busy = step === "running" && phase === "running";
  const dismiss = useCallback(() => {
    if (!useProjectCreateStore.getState().open) return;
    if (useProjectCreateStore.getState().phase === "running") return;
    useProjectCreateStore.getState().close();
  }, []);
  useModalFocus(modal, true, dismiss);

  const reached = RAIL.indexOf(step);
  return createPortal(
    <div className="modal-backdrop" onClick={dismiss}>
      <section
        ref={modal}
        className="modal np"
        role="dialog"
        aria-modal="true"
        aria-labelledby="np-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <div className="np__lead">
            {canBack && !busy ? (
              <button className="icon-btn np__back" type="button" title="Back" onClick={back}>
                <ChevronIcon size={15} />
              </button>
            ) : null}
            <div className="modal__heading">
              <span className="project-kicker">NEW PROJECT</span>
              <h2 className="modal__title" id="np-title">{TITLES[step]}</h2>
            </div>
          </div>
          <button
            className="icon-btn"
            type="button"
            title="Close"
            disabled={busy}
            onClick={close}
          >
            <CloseIcon size={15} />
          </button>
        </header>
        {reached >= 0 ? (
          <div className="np__rail" aria-label={`Step ${reached + 1} of ${RAIL.length}`}>
            {RAIL.map((entry, index) => (
              <i key={entry} className={index <= reached ? "np__rail-on" : ""} />
            ))}
          </div>
        ) : null}
        <div className="modal__body np__body">
          {/* Keyed so each screen animates in rather than swapping in place. */}
          <div className="np__step" key={step}>
          {step === "start" ? <StartChoiceStep /> : null}
          {step === "kind" ? <KindStep /> : null}
          {step === "stack" ? <StackStep /> : null}
          {step === "options" ? <OptionsStep /> : null}
          {step === "where" ? <DestinationStep /> : null}
          {step === "review" ? <ReviewStep /> : null}
          {step === "running" ? <ScaffoldRunView /> : null}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
