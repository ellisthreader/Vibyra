import { invoke } from '@tauri-apps/api/core';

// A panel can unmount while native playback starts. Queue its stop behind that
// start so a late acknowledgement cannot leave an invisible reply speaking.
let actions: Promise<unknown> = Promise.resolve();
let owner: string | null = null;
function queue(command: string, args: Record<string, unknown>): Promise<void> {
  const action = actions.catch(() => {}).then(() => invoke<void>(command, args));
  actions = action;
  return action;
}
export const startReplySpeech = (id: string, text: string) => { owner = id; return queue('speech_start', { id, text }); };
export const stopReplySpeech = (id: string) => { if (owner === id) owner = null; return queue('speech_stop', { id }); };
export const stopCurrentReplySpeech = () => owner ? stopReplySpeech(owner) : Promise.resolve();
