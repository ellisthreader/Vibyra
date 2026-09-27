import { invoke } from '@tauri-apps/api/core';

import { useSettingsStore } from '../state/settingsStore';

// A panel can unmount while native playback starts. Queue its stop behind that
// start so a late acknowledgement cannot leave an invisible reply speaking.
let actions: Promise<unknown> = Promise.resolve();
let owner: string | null = null;
function queue(command: string, args: Record<string, unknown>): Promise<void> {
  const action = actions.catch(() => {}).then(() => invoke<void>(command, args));
  actions = action;
  return action;
}
// Every spoken reply is said in the voice, at the pace and in the manner the
// settings page asks for. Read here rather than passed in, so a caller can
// never speak in last week's voice by holding a stale copy.
export const startReplySpeech = (id: string, text: string) => {
  owner = id;
  const settings = useSettingsStore.getState().settings;
  return queue('speech_start', {
    id,
    text,
    voice: settings?.speechVoice || null,
    rate: settings?.speechRate ?? null,
    style: settings?.speechStyle || null,
  });
};
export const stopReplySpeech = (id: string) => { if (owner === id) owner = null; return queue('speech_stop', { id }); };
export const stopCurrentReplySpeech = () => owner ? stopReplySpeech(owner) : Promise.resolve();
