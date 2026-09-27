import { useEffect, useRef, useState } from 'react';

import { adoptAsIs, cancelProjectCreate, runProjectCreate } from '../../../lib/projectCreateRun';
import { usePlannedProject, useProjectCreateStore } from '../../../state/projectCreateStore';
import { closeNewProject } from '../../../state/newProject';
import { CheckIcon } from '../../common/Icons';
import { BuildRing } from './BuildRing';

/**
 * The build, watched rather than waited out. The ring carries the progress, the
 * steps underneath say what each one was, and the log stays a click away for
 * the times it matters.
 *
 * The step list comes from the plan, not from Rust's reports, so all of it is
 * on screen from the first moment — what is going to happen is as visible as
 * what already has. A failure leaves the folder alone and offers a way out
 * rather than an apology.
 */
export function RunStep() {
  const phase = useProjectCreateStore(s => s.phase);
  const progress = useProjectCreateStore(s => s.progress);
  const log = useProjectCreateStore(s => s.log);
  const error = useProjectCreateStore(s => s.error);
  const [expanded, setExpanded] = useState(false);
  const tail = useRef<HTMLPreElement>(null);

  const steps = usePlannedProject().request.steps.map(step => step.label);
  const running = phase === 'running';
  const done = phase === 'done';
  const index = progress?.index ?? 0;
  const total = progress?.total ?? steps.length;
  const status = running
    ? progress?.label ?? 'Getting the folder ready…'
    : done ? 'Your project is ready.' : error ?? 'Stopped.';

  useEffect(() => {
    if (expanded && tail.current) tail.current.scrollTop = tail.current.scrollHeight;
  }, [expanded, log]);

  return <div className="np-run">
    <BuildRing phase={phase} index={index} total={total} label={status} />
    <p className={`np-run__status ${phase === 'failed' ? 'np-run__status--bad' : ''}`} role="status">{status}</p>
    {steps.length > 0 && <ol className="np-run__steps">
      {steps.map((step, at) => {
        const finished = done || at < index;
        const active = running && at === index;
        return <li key={`${step}-${at}`} className={finished ? 'is-done' : active ? 'is-active' : ''}>
          <span className="np-run__bullet">{finished && <CheckIcon size={11} />}</span>{step}
        </li>;
      })}
    </ol>}
    {log.length > 0 && <button className="np-quiet" type="button" aria-expanded={expanded}
      onClick={() => setExpanded(!expanded)}>
      {expanded ? 'Hide output' : `Show output (${log.length} lines)`}
    </button>}
    {expanded && <pre className="np-run__log" ref={tail}>{log.join('\n')}</pre>}
    <footer className="np-foot">
      {running
        ? <button className="btn" type="button" onClick={cancelProjectCreate}>Cancel</button>
        : <>
          <button className="btn" type="button" onClick={closeNewProject}>Close</button>
          {phase === 'stalled'
            ? <button className="btn btn--primary" type="button" onClick={() => adoptAsIs(true)}>
              Open it in a terminal
            </button>
            : log.length > 0
              // Something was already written into the folder, so a second run
              // would only be refused for finding files there.
              ? <button className="btn btn--primary" type="button" onClick={() => adoptAsIs(false)}>
                Open the folder anyway
              </button>
              : <button className="btn btn--primary" type="button" onClick={() => void runProjectCreate()}>
                Try again
              </button>}
        </>}
    </footer>
  </div>;
}
