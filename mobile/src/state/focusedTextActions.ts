import type { WorkspaceStore } from './WorkspaceStore';
import type { FocusedTextReply, FocusedTextRequest } from '../phoneKeyboard/types';

export function focusedTextActions(store: WorkspaceStore): FocusedTextRequest {
  return async (method, params = {}) => {
    const epoch = store.epoch;
    if (store.state.status !== 'connected' || !store.state.canType || !store.state.focusedTextAvailable)
      throw new Error('Reconnect with Typing from your phone enabled on your Mac.');
    const result = await store.deps.rpc.request<FocusedTextReply>(`focusedText.${method}`, params);
    store.assertCurrent(epoch);
    if (!store.state.canType) throw new Error('Typing from your phone was turned off.');
    if (!result || !('target' in result)) throw new Error('The Mac returned an invalid keyboard response.');
    return result;
  };
}
