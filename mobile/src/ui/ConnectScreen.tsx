import { ConnectFlow } from '../connection/ConnectFlow';
import { ConnectionModal } from '../connection/ConnectionModal';
import type { WorkspaceModel } from './types';

// The onboarding presentation of the shared connect flow. The Remote page mounts
// the same flow inline, so both stay in step.
export function ConnectScreen({ visible, workspace, onClose }: {
  visible: boolean; workspace: WorkspaceModel; onClose: () => void;
}) {
  return visible ? <ConnectionModal onClose={onClose}>
    <ConnectFlow workspace={workspace} onClose={onClose} />
  </ConnectionModal> : null;
}
