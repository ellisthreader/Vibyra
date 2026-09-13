import { useState } from 'react';
import { AccountForm, type AccountMode } from '../onboarding/AccountForm';
import { Sheet } from './Sheet';
import type { WorkspaceModel } from './types';

export function AccountSheet({ visible, workspace, onClose }: { visible: boolean; workspace: WorkspaceModel; onClose: () => void }) {
  return <Sheet title="Your Vibyra account" visible={visible} onClose={onClose}>
    {visible && <AccountPanel workspace={workspace} onDone={onClose} />}
  </Sheet>;
}

/**
 * The sign-in form without a sheet of its own, for a sheet that is already on
 * screen: presenting a second modal over a live one is the iOS race this
 * codebase has been bitten by, so a page that needs a signed-in person swaps
 * this in where its own content was.
 */
export function AccountPanel({ workspace, onDone }: { workspace: WorkspaceModel; onDone: () => void }) {
  const [mode, setMode] = useState<AccountMode>('login');
  return <AccountForm workspace={workspace} mode={mode} onMode={setMode} onDone={onDone} continueLabel="Done" />;
}
