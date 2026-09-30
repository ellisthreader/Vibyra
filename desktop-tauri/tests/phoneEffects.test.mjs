import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const hooks = registerHooks({ resolve: (specifier, context, next) => next(
  context.parentURL?.endsWith('/phoneTerminalAnswer.ts') && specifier.startsWith('./') && !specifier.endsWith('.ts') ? `${specifier}.ts` : specifier, context) });
const { answerTerminalRequest } = await import('../src/lib/phoneTerminalAnswer.ts');
hooks.deregister();
test('revocation during model discovery prevents a delayed phone launch', async () => {
  let finish; const blocked = new Promise(resolve => { finish = resolve; });
  let allowed = true; let launches = 0; const ids = [];
  const result = answerTerminalRequest({ id: 'native-random', requestId: 'dedupe-intent', action: 'create',
    projectId: 'p', kind: 'codex', model: 'm', title: 'Work' }, {
    authorize: async id => { ids.push(id); if (!allowed) throw new Error('This phone request is no longer authorized.'); },
    agents: async () => [{ id: 'codex', installed: true }],
    models: async id => { assert.equal(id, 'native-random'); await blocked; return [{ id:'m',kind:'codex',model:'m' }]; },
    launch: async () => { launches++; return [{ paneId: 1 }]; }, approvalPending: () => false,
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  allowed = false; finish();
  assert.match((await result).error, /no longer authorized/);
  assert.equal(launches, 0); assert.deepEqual(ids, ['native-random', 'native-random']);
});
test('live create and resume carry native request ID separately from idempotency ID', async () => {
  const observed = [];
  const dependencies = { authorize: async id => observed.push(['authorize',id]),
    agents: async () => [{ id:'shell',installed:true }], models: async () => [], approvalPending: () => false,
    launch: async (...args) => { observed.push(['launch',args[4],args[7]]); return [{ paneId:2 }]; },
    resumeSaved: async (pane,project,id) => { observed.push(['resume',pane,project,id]); return 3; } };
  assert.deepEqual(await answerTerminalRequest({ id:'native',requestId:'intent',action:'create',kind:'shell',projectId:'p',title:'Work' }, dependencies), { result:{paneId:2} });
  assert.deepEqual(await answerTerminalRequest({ id:'resume-native',action:'resumeSaved',paneId:-1,projectId:'p' },dependencies), {result:{paneId:3}});
  assert.ok(observed.some(row => row[0]==='launch' && row[1]==='intent' && row[2]==='native'));
  assert.ok(observed.some(row => row[0]==='resume' && row[3]==='resume-native'));
});
