import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { create } from 'zustand';
import * as turns from '../src/lib/talkTurn.ts';

export const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const state = value => ({ getState: () => value });
async function load(path, dependencies, result) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const body = stripTypeScriptTypes(source.replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/^export /gm, ''));
  return new Function(...Object.keys(dependencies), `${body}\nreturn ${result};`)(...Object.values(dependencies));
}
export async function mount(options = {}) {
  const starts = [], calls = [], sent = [], timers = [], phases = [];
  let owner = null, levels = 0, speechPolls = 0;
  const settings = state({ settings: {} });
  const tools = await load('../src/ipc/tools.ts', {
    invoke: async (command, args) => {
      calls.push(command);
      if (command === 'voice_status') return { recorder: true, keyConfigured: true };
      if (command === 'voice_start') {
        const start = deferred(); starts.push(start);
        await start.promise; owner = start; levels = 0; return;
      }
      if (command === 'voice_stop') { owner = null; return args.discard ? null : options.transcription ? options.transcription.promise : 'Seven blue lanterns'; }
      if (command === 'voice_level') return { recording: true, metered: true, rms: levels++ === 0 ? 0.1 : 0, seconds: 1 };
      assert.fail(`Unexpected IPC ${command}`);
    }, useSettingsStore: settings,
  }, '{ voiceStart, voiceStop, voiceStatus, voiceLevel }');
  const chat = { threads: {}, error: null, send: async (projectId, text) => {
    sent.push(text); chat.threads[projectId] = [{ role: 'assistant', status: 'complete', content: 'Seven blue lanterns', id: `reply-${sent.length}` }];
  } };
  const store = await load('../src/state/talkStore.ts', {
    ...tools, ...turns, create, shortcutLabel: x => x,
    startReplySpeech: async () => {}, stopCurrentReplySpeech: async () => {},
    invoke: async () => ++speechPolls === 1 && options.speechActive ? options.speechActive.promise : false, useChatStore: state(chat),
    useProjectStore: state({ activeId: 'qa' }), useSettingsStore: settings,
    useWorkspaceStore: state({ setCompanionTab: () => {} }),
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
  }, 'useTalkStore');
  store.subscribe(value => phases.push({ phase: value.phase, title: value.title }));
  return { store, starts, calls, sent, phases, timers, owner: () => owner,
    async tick(delay) { const index = timers.findIndex(timer => timer.delay === delay); assert.ok(index >= 0); timers.splice(index, 1)[0].callback(); await flush(); },
    async cleanup() { store.getState().end(); for (const start of starts) start.resolve(); await flush(); },
  };
}

export async function lifetime(store, scope) {
  let cleanup, dependencies, dictationCanceled = 0;
  const hook = await load('../src/lib/useVoiceLifecycle.ts', {
    useEffect: (effect, deps) => { cleanup = effect(); dependencies = deps; },
    useTalkStore: store, useVoiceStore: state({ cancel: () => { dictationCanceled++; } }),
  }, 'useVoiceLifecycle');
  hook(scope);
  return { cleanup, dependencies, dictationCanceled: () => dictationCanceled };
}
