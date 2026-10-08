import { useEffect, useState } from 'react';
import { agentV2Available, agentV2RunnerStatus, onAgentV2RunnerStatus } from '../../ipc/agentV2';
import { useWorkspaceStore } from '../../state/workspaceStore';

/** The Mac runner's state, from its snapshot and then its change events. */
function useRunnerState(): string | null {
  const [state, setState] = useState<string | null>(null);
  useEffect(() => {
    if (!agentV2Available()) return;
    let live = true;
    const unlisten = onAgentV2RunnerStatus((status) => { if (live) setState(status.state); });
    void agentV2RunnerStatus().then((status) => { if (live) setState(status.state); }).catch(() => {});
    return () => { live = false; void unlisten.then((fn) => fn()).catch(() => {}); };
  }, []);
  return state;
}

/** One quiet row when the selected AI account cannot run Agent tasks yet. */
export function RunnerNotice() {
  if (useRunnerState() !== 'not_ready') return null;
  return <div className="teammate-notice" role="status">
    <span>Agent tasks need a Claude Code account for now. Choose a Claude Code account in Settings → AI accounts.</span>
    <button type="button" onClick={() => useWorkspaceStore.getState().openSettingsSection('ai', 'terminalAccounts')}>Open AI accounts</button>
  </div>;
}
