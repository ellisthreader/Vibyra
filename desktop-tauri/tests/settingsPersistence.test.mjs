import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
let disk = { agentView: 'terminal', theme: 'dark', enabledAgentIds: [] };
const pending = [];
globalThis.settingsFixture = { read: async () => disk, save: settings => new Promise((resolve, reject) => pending.push({ settings, resolve: () => { disk = settings; resolve(); }, reject })) };
globalThis.document = { documentElement: { dataset: {} } };
globalThis.window = { matchMedia: () => ({ addEventListener() {} }) };
const hooks = registerHooks({
 resolve(specifier, context, next) {
  if (context.parentURL?.includes('/settingsStore.ts') && specifier.startsWith('.')) return { url: `fixture:${specifier}`, shortCircuit: true };
  return next(specifier, context);
 },
 load(url, context, next) {
  const sources = {
   'fixture:../ipc/settings': 'export const getSettings=()=>settingsFixture.read(); export const saveSettings=s=>settingsFixture.save(s);',
   'fixture:../lib/notificationPrefs': 'export const DEFAULT_NOTIFICATIONS={}; export const normalizeNotifications=v=>v??{};',
   'fixture:../lib/performanceMode': 'export const applyPerformanceMode=()=>{}; export const normalizePerformanceMode=(value)=>value===true?"best":value===false?"balanced":value;',
   'fixture:../lib/terminalRegistry': 'export const applySettingsToAll=()=>{};',
   'fixture:../lib/xtermTheme': 'export const resolveTheme=t=>t;',
  };
  return sources[url] ? { format: 'module', source: sources[url], shortCircuit: true } : next(url, context);
 }
});
const { useSettingsStore: store, flushSettings } = await import('../src/state/settingsStore.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));
test('rapid view and appearance changes serialize and survive reopening', async () => {
 await store.getState().load();
 const first = store.getState().update({ agentView: 'chat' });
 const second = store.getState().update({ theme: 'light' });
 const third = store.getState().update({ agentView: 'terminal' });
 await tick(); assert.equal(pending.length, 1);
 pending.shift().resolve(); await first; await tick();
 assert.equal(pending.length, 1); assert.equal(pending[0].settings.agentView, 'chat');
 pending.shift().resolve(); await second; await tick();
 pending.shift().resolve(); await third;
 await store.getState().load();
 assert.equal(store.getState().settings.agentView, 'terminal');
 assert.equal(store.getState().settings.theme, 'light');
});
test('failed settings save is visible and quit checkpoint retries the latest choice', async () => {
 const change = store.getState().update({ agentView: 'chat' });
 const rejected = assert.rejects(change, /disk full/);
 await tick(); pending.shift().reject(Error('disk full')); await rejected;
 assert.match(store.getState().saveError, /could not be saved/);
 const flush = flushSettings(); await tick();
 assert.equal(pending[0].settings.agentView, 'chat');
 pending.shift().resolve(); await flush;
 assert.equal(store.getState().saveError, '');
 await store.getState().load(); assert.equal(store.getState().settings.agentView, 'chat');
});
test('quit checkpoint waits for settings changed while a save is in flight', async () => {
 let finished = false;
 const checkpoint = flushSettings().then(() => { finished = true; });
 await tick();
 const change = store.getState().update({ agentView: 'terminal' });
 pending.shift().resolve(); await tick();
 assert.equal(finished, false);
 pending.shift().resolve(); await change; await checkpoint;
 assert.equal(disk.agentView, 'terminal');
});
test('quit checkpoint flushes typed values before their debounce timer fires', async () => {
 store.getState().commit({ fontSize: 17 });
 const checkpoint = flushSettings(); await tick();
 assert.equal(pending.length, 1);
 assert.equal(pending[0].settings.fontSize, 17);
 pending.shift().resolve(); await checkpoint;
 assert.equal(disk.fontSize, 17);
});
test('quit checkpoint also drains typed values staged during a disk write', async () => {
 const checkpoint = flushSettings(); await tick();
 store.getState().commit({ fontSize: 19 });
 pending.shift().resolve(); await tick();
 assert.equal(pending.length, 1);
 assert.equal(pending[0].settings.fontSize, 19);
 pending.shift().resolve(); await checkpoint;
 assert.equal(disk.fontSize, 19);
});
test.after(() => { hooks.deregister(); delete globalThis.settingsFixture; delete globalThis.window; delete globalThis.document; });
