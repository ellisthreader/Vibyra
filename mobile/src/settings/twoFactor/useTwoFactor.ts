import { useCallback, useEffect, useState } from 'react';
import type { TwoFactorState, WorkspaceModel } from '../../ui/types';

export type TwoFactorStatus =
  | { state: 'loading' }
  /** The server could not be asked. Shown with a way to ask again, never as "off". */
  | { state: 'unknown'; problem: string }
  | { state: 'ready'; detail: TwoFactorState };

/**
 * What the server says about this account's second factor, asked for once each time
 * the page opens.
 *
 * It is never guessed at. A page that drew "Off" while the answer was still coming,
 * or after it failed, would be inviting somebody to set up a second factor they
 * already have — so until there is an answer there is a spinner, and if the answer
 * never comes there is a line saying so and a way to try again.
 */
export function useTwoFactor(workspace: WorkspaceModel) {
  const load = workspace.actions.loadTwoFactor;
  const [status, setStatus] = useState<TwoFactorStatus>({ state: 'loading' });
  const reload = useCallback(async () => {
    if (!load) return;
    setStatus({ state: 'loading' });
    try {
      setStatus({ state: 'ready', detail: await load() });
    } catch (reason) {
      setStatus({
        state: 'unknown',
        problem:
          reason instanceof Error ? reason.message : 'Your security settings could not be loaded.',
      });
    }
  }, [load]);
  useEffect(() => {
    void reload();
  }, [reload]);
  /** What the page already knows after an action, without a second round trip. */
  const settle = useCallback(
    (detail: Partial<TwoFactorState>) =>
      setStatus((current) =>
        current.state === 'ready'
          ? { state: 'ready', detail: { ...current.detail, ...detail } }
          : {
              state: 'ready',
              detail: {
                enabled: false,
                available: true,
                confirmedAt: null,
                recoveryCodesLeft: 0,
                ...detail,
              },
            },
      ),
    [],
  );
  return { status, reload, settle };
}
