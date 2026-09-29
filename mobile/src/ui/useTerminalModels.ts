import { isTerminalModel } from './terminalModelPolicy';
import { useCallback, useEffect, useState } from 'react';
import type { TerminalModel, WorkspaceModel } from './types';

/** Scope every response to this presentation and computer, including retries. */
export function useTerminalModels(visible: boolean, workspace: WorkspaceModel) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    models: TerminalModel[];
    loading: boolean;
    error: string | null;
    permissions: boolean;
    efforts: boolean;
  }>({
    models: [],
    loading: false,
    error: null,
    permissions: false, efforts: false,
  });
  const load = workspace.actions.listTerminalModels;
  const supported = workspace.terminalModelsAvailable === true;
  useEffect(() => {
    let current = true;
    setState({ models: [], loading: visible && supported, error: null, permissions: false, efforts: false });
    if (visible && supported && workspace.status === 'connected' && load) {
      void load().then(
        (result) => {
          if (current) setState({ models: result.models.filter(model =>
            isTerminalModel(model.id) && (result.runnerKinds ?? ['codex', 'claude']).includes(model.kind)), loading: false, error: null,
            efforts: result.effortVersion === 1, permissions: result.permissionsVersion === 1 && result.permissionModes?.includes('standard') === true && result.permissionModes.includes('full') });
        },
        (error) => {
          if (current)
            setState({
              models: [],
              loading: false,
              error: error instanceof Error ? error.message : 'Could not load models.',
              permissions: false, efforts: false,
            });
        },
      );
    } else setState({ models: [], loading: false, error: null, permissions: false, efforts: false });
    return () => {
      current = false;
    };
  }, [visible, supported, workspace.host?.id, workspace.status, load, revision]);
  return { ...state, supported, refresh: useCallback(() => setRevision((value) => value + 1), []) };
}
