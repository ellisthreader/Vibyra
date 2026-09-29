import { useState } from 'react';
import type { WorkspaceModel } from '../ui/types';
import { ACTIVE_RUN, type PreviewRunnable, type RunApproval, type RunSummary } from './runnable';
import { FAILED_RUN } from './RunStatusLine';

export type RunActions = Pick<WorkspaceModel['actions'], 'runPreview' | 'stopPreview'>;
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

/** One runnable app's run from the phone. Nothing runs without a tap on the exact
 *  command shown; a command that changed on the computer is shown again for another tap.
 *  Every request names the computer's own project for the row, never the visible chat's:
 *  the same folder can have another id in a shared chat, which the computer cannot find. */
export function useRunControl({ row, actions, onChanged }: {
  row: PreviewRunnable; actions: RunActions;
  /** Read the list again: the computer's rows carry the run's progress. */
  onChanged(): void;
}) {
  const projectId = row.projectId;
  const [prompt, setPrompt] = useState<RunApproval | null>(null);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /** What needs the person's decision before it can run: never shown as a fault. */
  const [hint, setHint] = useState('');
  // The run's own answer shows until the listed row catches up with that run.
  const run = summary && row.runId !== summary.runId ? { ...row, ...summary } : row;
  const shown = prompt ?? row;
  const asks = prompt ? true : row.approvalRequired;

  const start = async () => {
    if (!actions.runPreview || busy) return;
    const version = shown.commandVersion;
    setBusy(true); setError(''); setHint('');
    try {
      const result = await actions.runPreview(projectId, row.targetId, asks ? { approve: true, commandVersion: version } : {});
      if ('approvalRequired' in result) {
        // Never approve on the person's behalf: a new command needs a new tap.
        setPrompt(result);
        setHint(result.commandVersion !== version ? 'This command changed. Check it, then run it again.'
          : 'Your computer needs your approval for this command. Check it, then tap Run.');
        return;
      }
      setPrompt(null); setSummary(result); onChanged();
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };
  const stop = async () => {
    if (!actions.stopPreview || busy) return;
    setBusy(true); setError('');
    try { await actions.stopPreview(projectId, row.targetId); setSummary(null); onChanged(); }
    catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };

  return { run, shown, asks, prompt, busy, error, hint, start, stop,
    active: ACTIVE_RUN.includes(run.runState), failed: FAILED_RUN.includes(run.runState) };
}
