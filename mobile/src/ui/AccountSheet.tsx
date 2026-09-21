import { useRef, useState } from 'react';
import type { ScrollView } from 'react-native';
import { AccountForm, type AccountMode } from '../onboarding/AccountForm';
import { revealFormEnd } from './keyboardOffset';
import { Sheet } from './Sheet';
import type { WorkspaceModel } from './types';

/** `mode` is where the form opens: Settings' "Create account" row opens on sign-up. */
export function AccountSheet({ visible, workspace, onClose, mode }: {
  visible: boolean; workspace: WorkspaceModel; onClose: () => void; mode?: AccountMode;
}) {
  const scroll = useRef<ScrollView>(null);
  return <Sheet title="Your Vibyra account" visible={visible} onClose={onClose} scrollRef={scroll}>
    {visible && <AccountPanel workspace={workspace} onDone={onClose} initialMode={mode} onFocusPassword={() => revealFormEnd(scroll)} />}
  </Sheet>;
}

/**
 * The sign-in form without a sheet of its own, for a sheet that is already on
 * screen: presenting a second modal over a live one is the iOS race this
 * codebase has been bitten by, so a page that needs a signed-in person swaps
 * this in where its own content was.
 */
export function AccountPanel({ workspace, onDone, initialMode = 'login', onFocusPassword }: {
  workspace: WorkspaceModel; onDone: () => void; initialMode?: AccountMode; onFocusPassword?: () => void;
}) {
  const [mode, setMode] = useState<AccountMode>(initialMode);
  return <AccountForm workspace={workspace} mode={mode} onMode={setMode} onDone={onDone} continueLabel="Done" onFocusPassword={onFocusPassword} />;
}
