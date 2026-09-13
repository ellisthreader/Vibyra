import { useState } from 'react';
import { ConnectSetup } from './ConnectSetup';
import { ConnectingStep } from './ConnectingStep';
import { DiscoveryStep } from './DiscoveryStep';
import type { NearbyComputer } from './discoveryTypes';
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
export function ConnectFlow({ workspace, onClose }: { workspace: WorkspaceModel; onClose: () => void }) {
  const [page, setPage] = useState<'setup' | 'search' | 'connect'>('setup');
  const [computer, setComputer] = useState<NearbyComputer>();
  if (page === 'setup') return <ConnectSetup workspace={workspace} onInstalled={() => setPage('search')} />;
  if (page === 'search') {
    return <DiscoveryStep onSelect={found => { setComputer(found); setPage('connect'); }}
      onBack={() => setPage('setup')} />;
  }
  if (page === 'connect' && computer) {
    return <ConnectingStep workspace={workspace} computer={computer} onDone={onClose}
      onSearch={() => setPage('search')} />;
  }
  return null;
}
