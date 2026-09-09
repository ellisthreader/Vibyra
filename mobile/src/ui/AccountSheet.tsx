import { useState } from 'react';
import { AccountForm, type AccountMode } from '../onboarding/AccountForm';
import { Sheet } from './Sheet';
import type { WorkspaceModel } from './types';

export function AccountSheet({ visible, workspace, onClose }: { visible: boolean; workspace: WorkspaceModel; onClose: () => void }) {
  const [mode, setMode] = useState<AccountMode>('login');
  return <Sheet title="Your Vibyra account" visible={visible} onClose={onClose}>
    {visible && <AccountForm workspace={workspace} mode={mode} onMode={setMode} onDone={onClose} continueLabel="Done" />}
  </Sheet>;
}
