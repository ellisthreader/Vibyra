import { RAIL, STEP_TITLES } from '../../lib/projectCreateFlow';
import { useProjectCreateStore } from '../../state/projectCreateStore';
import { closeNewProject } from '../../state/newProject';
import { ChevronIcon, CloseIcon } from '../common/Icons';
import { KindStep } from './newProject/KindStep';
import { StartChoiceStep } from './newProject/StartChoiceStep';
import { OptionsStep } from './newProject/OptionsStep';
import { RunStep } from './newProject/RunStep';
import { StackStep } from './newProject/StackStep';
import { WhereStep } from './newProject/WhereStep';
import '../../styles/new-project.css';
import '../../styles/new-project-steps.css';
import '../../styles/new-project-build.css';

/**
 * Starting a project: what are you making, which stack, what is it called,
 * how should it be set up — then Vibyra builds it with the stack's own
 * official tooling and opens it.
 *
 * The same questions the phone asks (`mobile/src/ui/newProject/`), asked by the
 * window instead, and answered by `vibyra_core::scaffold` either way. Every
 * question but the name can be skipped, and every path still reaches a folder.
 */
export function NewProjectPage() {
  const step = useProjectCreateStore(s => s.step);
  const phase = useProjectCreateStore(s => s.phase);
  const canBack = useProjectCreateStore(s => s.history.length > 0);
  const back = useProjectCreateStore(s => s.back);
  const running = phase === 'running';
  const reached = RAIL.indexOf(step);

  return <main className="new-project-page" aria-label="New project">
    <div className={`np ${step === 'start' ? 'np--tight' : ''}`}>
      <header className="np__head">
        {/* The title shares the content's left edge. Reserving a slot for the
            back button in front of it indented every heading past the cards
            below it, which is the misalignment that read as unfinished. Back
            rides the kicker's line instead, where it shifts nothing. */}
        <div className="np__meta">
          {canBack && !running
            ? <button className="icon-btn np__back" type="button" title="Back" aria-label="Back" onClick={back}>
              <ChevronIcon size={14} />
            </button>
            : null}
          <span className="np__kicker">NEW PROJECT</span>
          <span className="np__meta-end">
            {reached >= 0 && <span className="np__rail" role="progressbar" aria-valuemin={1}
              aria-valuemax={RAIL.length} aria-valuenow={reached + 1}
              aria-label={`Step ${reached + 1} of ${RAIL.length}`}>
              {RAIL.map((entry, index) => <i key={entry} className={index <= reached ? 'np__rail-on' : ''} />)}
            </span>}
            <button className="icon-btn" type="button" title="Close" aria-label="Close"
              disabled={running} onClick={closeNewProject}><CloseIcon size={15} /></button>
          </span>
        </div>
        <h1>{STEP_TITLES[step]}</h1>
      </header>
      {/* Keyed so each screen rises in rather than swapping in place. */}
      <div className="np__step" key={step}>
        {step === 'start' && <StartChoiceStep />}
        {step === 'kind' && <KindStep />}
        {step === 'stack' && <StackStep />}
        {step === 'where' && <WhereStep />}
        {step === 'options' && <OptionsStep />}
        {step === 'running' && <RunStep />}
      </div>
    </div>
  </main>;
}
