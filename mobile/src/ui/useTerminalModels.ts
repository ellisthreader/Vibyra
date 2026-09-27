import { useCallback, useEffect, useState } from 'react';
import type { TerminalModel, WorkspaceModel } from './types';

/** Scope every response to this presentation and computer, including retries. */
export function useTerminalModels(visible: boolean, workspace: WorkspaceModel) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    models: TerminalModel[];
    loading: boolean;
    error: string | null;
  }>({
    models: [],
    loading: false,
    error: null,
  });
  const load = workspace.actions.listTerminalModels;
  const supported = workspace.terminalModelsAvailable === true;
  useEffect(() => {
    let current = true;
    setState({ models: [], loading: visible && supported, error: null });
    if (visible && supported && workspace.status === 'connected' && load) {
      void load().then(
        (result) => {
          if (current) setState({ models: result.models, loading: false, error: null });
        },
        (error) => {
          if (current)
            setState({
              models: [],
              loading: false,
              error: error instanceof Error ? error.message : 'Could not load models.',
            });
        },
      );
    } else setState({ models: [], loading: false, error: null });
    return () => {
      current = false;
    };
  }, [visible, supported, workspace.host?.id, workspace.status, load, revision]);
  return { ...state, supported, refresh: useCallback(() => setRevision((value) => value + 1), []) };
}
