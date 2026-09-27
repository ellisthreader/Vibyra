import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { readConversationLayout, writeConversationLayout } from '../src/lib/conversationLayout.ts';
const values = new Map();
globalThis.localStorage = { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v) };
globalThis.requestAnimationFrame = () => {};
let sessions = []; const listeners = [];
const account = { snapshot: { profile: { email: 'owner@example.test' } } };
globalThis.layoutFixture = { list: async () => sessions, account, listeners };
const hooks = registerHooks({
 resolve(specifier, context, next) {
  if (context.parentURL?.includes('/conversationTerminalStore.ts')) {
   if (specifier === '../ipc/sharedChats') return {url:'fixture:list',shortCircuit:true};
   if (specifier === './accountStore') return {url:'fixture:account',shortCircuit:true};
   if (specifier === './terminalStore' || specifier === './workspaceStore') return {url:'fixture:ui',shortCircuit:true};
   if (specifier.startsWith('.')) return next(specifier+'.ts',context);
  }
  return next(specifier,context);
 },
 load(url,context,next) {
  const sources = {
   'fixture:list': 'export const listSharedChats = () => globalThis.layoutFixture.list();',
   'fixture:account': 'export const useAccountStore = {getState:()=>globalThis.layoutFixture.account,subscribe:fn=>globalThis.layoutFixture.listeners.push(fn)};',
   'fixture:ui': 'export const useTerminalStore={setState:()=>{}}; export const useWorkspaceStore={getState:()=>({setProjectMode:()=>{}})};',
  };
  return sources[url] ? {format:'module',source:sources[url],shortCircuit:true} : next(url,context);
 }
});
let run=0;
const restore=async()=> (await import(`../src/state/conversationTerminalStore.ts?run=${run++}`)).useConversationTerminals;
test('real store retains exactly open Codex cards through two cold restores and process exit', async()=>{
 const first=await restore(); sessions=[{id:'codex-a',status:'running'},{id:'old-history',status:'interrupted'}];
 await first.getState().refresh();
 sessions=[{id:'codex-a',status:'interrupted'},{id:'old-history',status:'interrupted'}];
 const second=await restore(); await second.getState().refresh(); assert.deepEqual(second.getState().open,['codex-a']);
 second.getState().reveal('old-history'); second.getState().dismiss('codex-a');
 const third=await restore(); await third.getState().refresh(); assert.deepEqual(third.getState().open,['old-history']);
 assert.deepEqual(third.getState().dismissed,['codex-a']);
});
test('stale empty refresh cannot erase newly opened cards; accounts have separate layouts',async()=>{
 const store=await restore(); store.getState().reveal('new'); sessions=[]; await store.getState().refresh();
 assert.ok(store.getState().open.includes('new'));
 assert.deepEqual(readConversationLayout(localStorage,'another@example.test').open,[]);
});
test('a storage failure remains visible after successful provider refresh',async()=>{
 const store=await restore(); const original=localStorage.setItem; localStorage.setItem=()=>{throw Error('disk full')};
 store.getState().reveal('cannot-save'); await store.getState().refresh(); assert.match(store.getState().saveError,/could not be saved/);
 localStorage.setItem=original;
});
test('damaged layout is reported and cannot be overwritten by refresh',async()=>{
 const key='terminal.conversations.layout.v1.owner%40example.test'; values.set(key,'{broken');
 const store=await restore(); sessions=[{id:'live',status:'running'}];await store.getState().refresh();
 assert.match(store.getState().saveError,/not been overwritten/);assert.equal(values.get(key),'{broken');
});
test('layouts round-trip independently of provider history',()=>{
 writeConversationLayout(localStorage,'fresh',{open:['a','b'],dismissed:['c']});
 assert.deepEqual(readConversationLayout(localStorage,'fresh'),{open:['a','b'],dismissed:['c']});
});
test.after(()=>{hooks.deregister();delete globalThis.localStorage;delete globalThis.requestAnimationFrame;delete globalThis.layoutFixture;});
