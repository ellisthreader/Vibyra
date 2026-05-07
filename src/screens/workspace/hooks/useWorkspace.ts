import { useWorkspaceActions } from "./useWorkspaceActions";
import { useWorkspaceState } from "./useWorkspaceState";

export function useWorkspace() {
  const state = useWorkspaceState();
  const actions = useWorkspaceActions(state);
  return { ...state, ...actions };
}
