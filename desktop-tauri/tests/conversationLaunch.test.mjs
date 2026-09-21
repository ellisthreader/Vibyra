import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const ops = {}; globalThis.__conversationLaunch = ops;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/launchConversationTerminal.ts')) {
      if (specifier.endsWith('/sharedChats') || specifier.endsWith('/conversationTerminalStore')) return { url: 'test:conversation-launch', shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === 'test:conversation-launch') return { format: 'module', shortCircuit: true, source: `
      export const createSharedChat = (...args) => globalThis.__conversationLaunch.create(...args);
      export const useConversationTerminals = {getState:()=>globalThis.__conversationLaunch.store};` };
    return next(url, context);
  },
});
const { launchConversationTerminal: launch } = await import('../src/lib/launchConversationTerminal.ts');
hooks.deregister();
const options = {model:'gpt-6-astra',reasoningEffort:'high',permissionMode:'standard',workspaceMode:'safe',safeSnapshotFingerprint:'first'};
function setup() {
  const saved = new Map(), calls = [], reveals = [];
  globalThis.localStorage = {getItem:key=>saved.get(key) ?? null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)};
  ops.create = async (...args) => {calls.push(args);return {id:'exact-session'};};
  ops.store = {refresh:async()=>{},reveal:id=>reveals.push(id)};
  return {saved,calls,reveals};
}
test('normal launch carries exact account/settings and reveals the same terminal', async () => {
  const {calls,reveals,saved} = setup();
  await launch('project','work','My terminal',options);
  assert.deepEqual(calls[0].slice(0,2),['project','work']);
  assert.deepEqual(calls[0][4],options);
  assert.deepEqual(reveals,['exact-session']);assert.equal(saved.size,0);
});
test('lost launch reply reuses identity and accepts a fresh safe-workspace approval', async () => {
  const {calls,saved,reveals} = setup();
  ops.create = async (...args) => {calls.push(args);if(calls.length===1)throw Error('Lost reply');return {id:'original'};};
  await assert.rejects(launch('project',null,'Codex',options),/Lost reply/);
  assert.equal(saved.size,1);
  await launch('project',null,'Codex',{...options,safeSnapshotFingerprint:'reapproved'});
  assert.equal(calls[0][2],calls[1][2]);assert.equal(calls[1][1],'default');
  assert.equal(calls[1][4].safeSnapshotFingerprint,'reapproved');assert.deepEqual(reveals,['original']);
});
test('cannot silently change settings on an uncertain launch or dispatch without a receipt', async () => {
  const {calls} = setup();
  ops.create = async (...args) => {calls.push(args);throw Error('Unknown');};
  await assert.rejects(launch('project','work','Codex',options));
  await assert.rejects(launch('project','work','Codex',{...options,permissionMode:'full'}),/original settings/);
  assert.equal(calls.length,1);
  globalThis.localStorage.setItem = () => {throw Error('Storage unavailable');};
  await assert.rejects(launch('another','work','Codex',options),/Storage unavailable/);
  assert.equal(calls.length,1);
});
test.after(()=>{delete globalThis.localStorage;delete globalThis.__conversationLaunch;});
