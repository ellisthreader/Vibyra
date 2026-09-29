import assert from 'node:assert/strict';
import test from 'node:test';
import { PhoneTextEditor } from '../src/phoneKeyboard/PhoneTextEditor';
import { PhoneTextController } from '../src/phoneKeyboard/MacFieldController';
import type { FocusedTextRequest } from '../src/phoneKeyboard/types';
import { delay, runtimeHarness } from './runtimeHarness';

function harness() {
  let id = 0; const uuid = () => `id-${++id}`;
  const mac = new PhoneTextController(uuid);
  const field = { fieldId: 'a', label: 'Message', context: 'Project', multiline: true, maxLength: 8000,
    value: '', selection: { start: 0, end: 0 },
    read() { return { text: this.value, selection: this.selection }; },
    apply(text: string, selection: { start: number; end: number }) { this.value = text; this.selection = selection; } };
  mac.focus(field);
  let interceptor: FocusedTextRequest | undefined;
  const dispatch: FocusedTextRequest = async (method, params = {}) => mac.handle('phone', `focusedText.${method}`, params);
  const calls: string[] = [];
  const editor = new PhoneTextEditor(async (method, params) => {
    calls.push(method); return (interceptor ?? dispatch)(method, params);
  }, uuid);
  return { mac, field, editor, calls, dispatch, intercept: (request: FocusedTextRequest) => { interceptor = request; } };
}
test('delayed acknowledgement preserves newer phone typing and writes it once', async () => {
  const h = harness(); await h.editor.open();
  let finish: (() => void) | undefined;
  h.intercept(async (method, params) => {
    const result = await h.dispatch(method, params);
    if (method === 'edit' && !finish) await new Promise<void>(resolve => { finish = resolve; });
    return result;
  });
  h.editor.edit('first', { start: 5, end: 5 }); await delay(50);
  h.editor.edit('first and next', { start: 14, end: 14 });
  assert.ok(finish); finish(); await delay(50);
  assert.equal(h.field.value, 'first and next');
  assert.equal(h.editor.state.text, 'first and next');
  assert.equal(h.editor.state.pending, false);
  assert.equal(h.calls.filter(m => m === 'edit').length, 2);
  h.editor.close();
});
test('Mac takeover and uncertain edits pause without replay or losing the phone copy', async () => {
  const h = harness(); await h.editor.open();
  h.field.value = 'Mac wins';
  h.editor.edit('phone copy'); await delay(60);
  assert.equal(h.field.value, 'Mac wins');
  assert.equal(h.editor.state.text, 'phone copy');
  assert.equal(h.editor.state.paused, true);
  await h.editor.open();
  h.intercept(async (method, params) => {
    const result = await h.dispatch(method, params);
    if (method === 'edit') throw new Error('Lost acknowledgement');
    return result;
  });
  h.editor.edit('possibly applied'); await delay(60); await h.editor.poll();
  assert.equal(h.field.value, 'possibly applied');
  assert.equal(h.editor.state.paused, true);
  assert.equal(h.calls.filter(m => m === 'edit').length, 2);
  h.editor.close();
});
test('closing before a queued edit prevents transmission; old reads cannot reopen the editor', async () => {
  const h = harness(); await h.editor.open();
  h.editor.edit('cancelled'); h.editor.close(); await delay(60);
  assert.equal(h.field.value, '');
  let finish: (() => void) | undefined;
  h.intercept(async (method, params) => {
    await new Promise<void>(resolve => { finish = resolve; }); return h.dispatch(method, params);
  });
  const open = h.editor.open(); await delay(); h.editor.close(); finish!(); await open;
  assert.equal(h.editor.state.target, null);
});
test('the store denies field requests without capability or typing and rejects old connection replies', async () => {
  const h = runtimeHarness();
  try {
    await assert.rejects(h.store.actions.focusedText!('snapshot'), /Reconnect/);
    h.store.update({ status: 'connected', canType: true, focusedTextAvailable: true });
    let finish: ((value: unknown) => void) | undefined;
    h.store.deps.rpc.request = (() => new Promise<unknown>(resolve => { finish = resolve; })) as typeof h.store.deps.rpc.request;
    const request = assert.rejects(h.store.actions.focusedText!('snapshot'), /connection changed/);
    h.store.epoch++; finish!({ target: null }); await request;
  } finally { h.store.dispose(); }
});
