import { useRef, useState } from 'react';
import { View } from 'react-native';
import { ComputerHandoff, type HandoffOrigin, type MachineFrame } from './ComputerHandoff';
import { ConnectSetup } from './ConnectSetup';
import { ConnectingStep } from './ConnectingStep';
import { CloudPermissionsStep } from './CloudPermissionsStep';
import type { RemotePermission } from '../remote/securityTypes';
import { DiscoveryStep } from './DiscoveryStep';
import type { NearbyComputer } from './discoveryTypes';
import type { CloudComputer } from '../remote/remoteApi';
import type { WorkspaceModel } from '../ui/types';

/**
 * Install, then find the computer, then connect to it. One flow, used by the
 * onboarding sheet and by the Remote page, so there is a single install/search
 * experience rather than two that drift apart. A fresh mount starts at setup,
 * with no network work until the search page appears.
 *
 * There is no pairing-code page: setup offers an emailed download link instead.
 * `PairingForm.tsx` and `ScannerSheet.tsx` are therefore unreferenced — restore a
 * route to them if relay or non-advertising computers need pairing by code again.
 */
export function ConnectFlow({
  workspace,
  onClose,
  onConnected,
}: {
  workspace: WorkspaceModel;
  onClose: () => void;
  /** Told before the flow closes itself, and only when it did connect a computer. */
  onConnected?: () => void;
}) {
  const frame = useRef<View>(null);
  const [origin, setOrigin] = useState<HandoffOrigin>();
  const [page, setPage] = useState<'setup' | 'search' | 'permissions' | 'connect'>('setup');
  const [permissions, setPermissions] = useState<RemotePermission[]>([]);
  const cloudAttempt = useRef<Promise<void> | undefined>(undefined);
  const [computer, setComputer] = useState<NearbyComputer>();
  // A computer chosen from the account's list is reached through Vibyra Cloud;
  // the connecting page is the same, only how the first hop is made differs.
  const [cloud, setCloud] = useState<string>();
  const pick = (found: NearbyComputer, hostId?: string, machine?: MachineFrame) => {
    const start = (container?: { x: number; y: number }) => {
      setOrigin(machine && container ? { machine, container } : undefined);
      setComputer(found);
      setCloud(hostId);
      setPage(hostId ? 'permissions' : 'connect');
    };
    if (machine && frame.current) frame.current.measureInWindow((x, y) => start({ x, y }));
    else start();
  };
  const pickCloud = (found: CloudComputer) => pick(
    { id: found.id, name: found.name, platform: found.platform ?? undefined },
    found.id,
  );
  return (
    <View ref={frame} collapsable={false} style={{ flex: 1 }}>
      {page === 'setup' && (
        <ConnectSetup
          workspace={workspace}
          onInstalled={() => setPage('search')}
          onCloud={pickCloud}
        />
      )}
      {page === 'search' && (
        <DiscoveryStep
          workspace={workspace}
          onCloud={pickCloud}
          onSelect={(found, machine) => pick(found, undefined, machine)}
          onBack={() => setPage('setup')}
        />
      )}
      {page === 'connect' && computer && (
        <ComputerHandoff key={computer.id} computer={computer} origin={origin}>
          <ConnectingStep
            workspace={workspace}
            computer={computer}
            cloud={
              cloud && workspace.actions.connectComputer
                ? () => {
                    const pending = cloudAttempt.current;
                    cloudAttempt.current = undefined;
                    return pending ?? workspace.actions.connectComputer!(cloud, permissions);
                  }
                : undefined
            }
            onDone={() => {
              onConnected?.();
              onClose();
            }}
            onSearch={() => setPage(cloud ? 'setup' : 'search')}
          />
        </ComputerHandoff>
      )}
      {page === 'permissions' && computer && <CloudPermissionsStep name={computer.name}
        onConnect={selected => {
          setPermissions(selected);
          // Begin within the tap so the browser can reserve its passkey popup.
          cloudAttempt.current = workspace.actions.connectComputer!(cloud!, selected);
          void cloudAttempt.current.catch(() => {});
          setPage('connect');
        }} onBack={() => setPage('setup')} />}
    </View>
  );
}
