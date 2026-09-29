import { Button, EmptyState, Hint } from './primitives';
import { useAction } from './useAction';
import type { Session, WorkspaceModel } from './types';
export function SavedTerminalScreen({ session, workspace }: { session: Session; workspace: WorkspaceModel }) {
  const { busy, error, run } = useAction();
  const resume = workspace.actions.resumeSavedSession;
  const allowed = workspace.status === 'connected' && workspace.canManage && resume;
  return <EmptyState icon="terminal-outline" title={session.title} detail="This terminal is saved on your computer. Open it to continue.">
    <Button title="Open terminal" disabled={!allowed || busy} onPress={() => { if (resume) void run(() => resume(session.id)); }} />
    {!workspace.canManage && <Hint>Turn on typing from your phone in your computer’s Phone settings to continue.</Hint>}
    {error && <Hint error>{error}</Hint>}
  </EmptyState>;
}
