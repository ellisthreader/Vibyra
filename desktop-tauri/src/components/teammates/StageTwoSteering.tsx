import { useMemo } from 'react';
import { stageTwoClient } from '../../../../mobile/src/agents/v2/stageTwoModel';
import { useSteering } from '../../../../mobile/src/agents/v2/useSteering';
import { teammateApi } from './api';
import { useAccountStore } from '../../state/accountStore';
import '../../styles/teammate-steering.css';

const uuid = () => crypto.randomUUID();

/** Corrections stay attached to this exact task; an uncertain submission reuses its original key. */
export function StageTwoSteering({ runId, active, refresh }: { runId: string; active: boolean; refresh(): Promise<void> }) {
  const account = useAccountStore(state => state.snapshot.profile?.email ?? '');
  const api = useMemo(() => stageTwoClient(teammateApi), []);
  const steering = useSteering(api, runId, active, uuid, refresh, account);
  const finished = steering.run?.terminal === true;
  return <div className="teammate-steering">
    <button type="button" className="teammate-steering-toggle" aria-expanded={steering.open}
      onClick={() => steering.setOpen(!steering.open)}>{steering.open ? 'Hide task updates' : active ? 'Adjust task' : 'Task updates'}</button>
    {steering.open && <section aria-label="Task updates" aria-busy={steering.busy}>
      {!steering.run && !steering.error && <p role="status">Loading this task…</p>}
      {steering.run?.instructions.map(instruction => <div className="teammate-steering-revision" key={instruction.revision}>
        <strong>Update {instruction.revision}</strong><p>{instruction.text}</p>
      </div>)}
      {steering.waiting && <p role="status">Updating your task… The agent will use your correction at its next safe checkpoint.</p>}
      {steering.run && steering.run.instructionRevision > 0 && steering.run.appliedInstructionRevision >= steering.run.instructionRevision && <p role="status">Your latest update is included.</p>}
      {finished && <p>This task has finished. Send a new message to continue.</p>}
      {active && !finished && <form onSubmit={event => { event.preventDefault(); void steering.send(); }}>
        <label htmlFor={`steer-${runId}`}>What should change?</label>
        <textarea id={`steer-${runId}`} rows={3} maxLength={8000} value={steering.text}
          readOnly={steering.busy || steering.uncertain} onChange={event => steering.setText(event.target.value)}
          placeholder="For example: only include Friday, and keep it brief." />
        <p>Completed actions stay recorded. Pending approvals are replaced when you update the task.</p>
        <button type="submit" disabled={steering.busy || !steering.run || (!steering.uncertain && !steering.text.trim())}>
          {steering.busy ? 'Sending…' : steering.uncertain ? 'Check and retry this update' : 'Update task'}
        </button>
      </form>}
      {steering.error && <p role="alert" className="teammate-steering-error">{steering.error}</p>}
    </section>}
  </div>;
}
