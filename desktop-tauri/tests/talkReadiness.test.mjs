import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { mount, flush, lifetime } from './talkReadinessFixture.mjs';

test('voice never announces Listening or prompts speech before native capture is ready', async () => {
  const f = await mount();
  try {
    f.store.getState().toggle(); await flush();
    assert.equal(f.starts.length, 1);
    assert.equal(f.store.getState().phase, 'starting');
    assert.equal(f.store.getState().title, 'Opening microphone');
    assert.ok(f.phases.every(s => s.phase !== 'listening'));
    assert.equal(f.calls.includes('voice_level'), false);
    assert.deepEqual(f.sent, []);
    f.starts[0].resolve(); await flush();
    assert.equal(f.store.getState().phase, 'listening');
    assert.equal(f.store.getState().title, 'Listening');
    assert.equal(f.owner(), f.starts[0]);
    const component = await readFile(new URL('../src/components/companion/VoiceMode.tsx', import.meta.url), 'utf8');
    assert.match(component, /starting: "Wait until the microphone is ready\."/);
  } finally { await f.cleanup(); }
});

test('microphone startup failure stays actionable and never claims readiness or sends a turn', async () => {
  const f = await mount();
  try {
    f.store.getState().toggle(); await flush();
    f.starts[0].reject(new Error('Microphone permission denied')); await flush();
    assert.equal(f.store.getState().phase, 'error');
    assert.match(f.store.getState().title, /Microphone permission denied/);
    assert.ok(f.phases.every(s => s.phase !== 'listening'));
    assert.deepEqual(f.sent, []);
    assert.equal(f.owner(), null);
  } finally { await f.cleanup(); }
});

test('canceling a pending start does not announce readiness or stop a newer recording', async () => {
  const f = await mount();
  try {
    f.store.getState().toggle(); await flush();
    f.store.getState().end();
    f.store.getState().toggle(); await flush();
    f.starts[0].resolve(); await flush();
    assert.equal(f.starts.length, 2);
    assert.equal(f.store.getState().phase, 'starting');
    assert.ok(f.phases.every(s => s.phase !== 'listening'));
    f.starts[1].resolve(); await flush();
    assert.equal(f.store.getState().phase, 'listening');
    assert.equal(f.owner(), f.starts[1], 'late old start must not queue a discard behind the new start');
    assert.equal(f.calls.filter(x => x === 'voice_stop').length, 1);
    assert.deepEqual(f.sent, []);
  } finally { await f.cleanup(); }
});

const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
async function finishTurn(f) { for (let i = 0; i < 11; i++) await f.tick(120); }

test('a canceled transcription cannot write its text into the next conversation', async () => {
  const transcription = deferred(), f = await mount({ transcription });
  try {
    f.store.getState().toggle(); await flush(); f.starts[0].resolve(); await flush();
    await finishTurn(f);
    assert.equal(f.store.getState().phase, 'thinking');
    f.store.getState().end(); f.store.getState().toggle(); await flush();
    transcription.resolve('old recording'); await flush();
    assert.equal(f.store.getState().heard, '');
    assert.deepEqual(f.sent, []);
    assert.equal(f.store.getState().phase, 'starting');
  } finally { transcription.resolve(''); await f.cleanup(); }
});

test('a late playback status cannot clear the newer speaking turn', async () => {
  const speechActive = deferred(), f = await mount({ speechActive });
  try {
    f.store.getState().toggle(); await flush(); f.starts[0].resolve(); await flush();
    await finishTurn(f); await f.tick(220);
    assert.equal(f.store.getState().speakingTurn, 'reply-1');
    f.store.getState().end(); f.store.getState().toggle(); await flush();
    f.starts[1].resolve(); await flush(); await finishTurn(f);
    assert.equal(f.store.getState().speakingTurn, 'reply-2');
    speechActive.resolve(false); await flush();
    assert.equal(f.store.getState().speakingTurn, 'reply-2');
  } finally { speechActive.resolve(false); await f.cleanup(); }
});


test('workspace account lifetime cleanup cancels a pending microphone and dictation', async () => {
  const f = await mount();
  try {
    const account = await lifetime(f.store, 'account-A');
    assert.deepEqual(account.dependencies, ['account-A']);
    f.store.getState().toggle(); await flush();
    account.cleanup(); await flush();
    f.starts[0].resolve(); await flush();
    assert.equal(f.store.getState().phase, 'idle');
    assert.equal(f.owner(), null);
    assert.equal(account.dictationCanceled(), 1);
    assert.deepEqual(f.sent, []);
    assert.ok(f.phases.every(s => s.phase !== 'listening'));
  } finally { await f.cleanup(); }
});
