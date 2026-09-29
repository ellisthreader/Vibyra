import type { Animated } from 'react-native';
import { ConnectFlow } from '../connection/ConnectFlow';
import { ConnectionModal } from '../connection/ConnectionModal';
import type { WorkspaceModel } from './types';

// The onboarding presentation of the shared connect flow. The Remote page mounts
// the same flow inline, so both stay in step. Finishing closes through the sheet,
// so it slides away before `onClose` runs; `presented` lets the page behind move with it.
export function ConnectScreen({
  visible,
  workspace,
  onClose,
  onConnected,
  presented,
}: {
  visible: boolean;
  workspace: WorkspaceModel;
  onClose: () => void;
  onConnected?: () => void;
  presented?: Animated.Value;
}) {
  return visible ? (
    <ConnectionModal onClose={onClose} presented={presented}>
      {(dismiss) => (
        <ConnectFlow workspace={workspace} onConnected={onConnected} onClose={dismiss} />
      )}
    </ConnectionModal>
  ) : null;
}
