// Real selected-account runtime, isolated workspace and encrypted phone UI.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { sharedChatProbe } from './shared-chat-probe.mjs';
import { serveFixture } from './fixture-server.mjs';
import { until } from './ui-test-helpers.mjs';
const probe = await sharedChatProbe();
let server, browser;
const request = (method, extra = {}) => probe.local(method, { sessionId: probe.session.id, ...extra });
try {
 const catalogue = await request('conversation.commands');
 for (const name of ['usage', 'status', 'model', 'effort']) assert.ok(catalogue.commands.some(c => c.name === name));
 const initial = await request('conversation.status'); assert.equal(initial.workingDirectory, await realpath(probe.dir));
 const { models } = await request('conversation.models'); assert.ok(models.length > 0);
 const model = models.find(m => m.model === initial.settings.model) ?? models[0];
 const effort = model.supportedReasoningEfforts.find(e => e.reasoningEffort === 'low')?.reasoningEffort ?? model.defaultReasoningEffort;
 const settings = { requestId: randomUUID(), revision: initial.settings.revision, model: model.model, effort };
 const applied = await request('conversation.settings', settings);
 assert.equal(applied.model, model.model); assert.equal(applied.effort, effort);
 assert.deepEqual(await request('conversation.settings', settings), applied, 'Settings retry reconciles to the original receipt');
 await assert.rejects(request('conversation.settings', { ...settings, requestId: randomUUID() }), /changed/);
 const usage = await request('conversation.usage'); assert.ok('thread' in usage && 'account' in usage);
 await assert.rejects(request('turn.submit', { submissionId: randomUUID(), text: '/unknown-command' }), /command menu/);
 console.log('PASS real account command catalogue, status, models, usage, effort, revision and receipt');
 await writeFile(join(probe.dir, 'context.txt'), 'The test project uses cobalt.\n');
 await writeFile(join(probe.dir, 'change.txt'), 'before\n');
 await writeFile(join(probe.dir, 'unrelated.txt'), 'Pre-existing user content must remain unchanged.\n');
 const attachmentId = randomUUID();
 const uploaded = await request('conversation.attachment', { attachmentId, name: 'reference.txt', mime: 'text/plain', offset: 0,
   content: Buffer.from('Attachment verification word: graphite').toString('base64'), complete: true });
 assert.ok(uploaded.complete && uploaded.hash);
 await assert.rejects(request('conversation.attachment', { attachmentId, name: 'reference.txt', mime: 'text/plain', offset: uploaded.offset, content: 'AAAA', complete: true }), /immutable/);
 const sent = await request('turn.submit', { submissionId: randomUUID(), attachments: [attachmentId], text:
   'This is an isolated UI verification. Read context.txt. Use apply_patch to change change.txt from before to after. Run a command that prints the word verification. Do not modify unrelated.txt. Then say the word from the attached reference.txt and summarize the change. Do not ask questions or do any other work.' });
 assert.equal(sent.status, 'accepted');
 const done = await until(async () => { const s = await request('conversation.snapshot'); return s.turnState === 'completed' ? s : false; }, 'recorded real operations', 120000);
 assert.equal(await readFile(join(probe.dir, 'unrelated.txt'), 'utf8'), 'Pre-existing user content must remain unchanged.\n');
 assert.equal((await readFile(join(probe.dir, 'change.txt'), 'utf8')).trim(), 'after');
 assert.ok(done.items.some(i => i.role === 'assistant' && i.text.includes('graphite')));
 const change = done.items.find(i => i.category === 'fileChange'); assert.ok(change?.artifact);
 const artifact = await request('conversation.artifact', { artifactId: change.artifact.id, hash: change.artifact.hash });
 assert.ok(artifact.content.includes('change.txt')); assert.ok(artifact.content.includes('+after')); assert.ok(!artifact.content.includes('unrelated.txt'));
 assert.ok(done.items.some(i => i.attachments?.[0].hash === uploaded.hash));
 console.log('PASS real operations, attributed diff, excluded unrelated edits and acknowledged attachment');
 server = await serveFixture('tests/terminalHostFixture.tsx');
 browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
 const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
 await page.goto(`${server.url}/?existing=1&conversation=1&invitation=${encodeURIComponent(JSON.stringify(probe.pairing))}`);
 await page.getByRole('textbox', { name: 'Message computer agent' }).waitFor({ timeout: 30000 });
 for (const command of ['status', 'usage', 'model', 'effort']) {
   await page.getByRole('textbox', { name: 'Message computer agent' }).fill(`/${command}`);
   await page.getByRole('button', { name: `/${command}`, exact: true }).click();
   if (command === 'status') await page.getByText(initial.workingDirectory, { exact: true }).waitFor();
   else if (command === 'usage') await page.getByText('This conversation', { exact: true }).waitFor();
   else if (command === 'model') await page.getByRole('radio').first().waitFor();
   else await page.getByRole('button', { name: 'Done setting thinking effort' }).waitFor();
   await page.screenshot({ path: `/tmp/vibyra-redesign-phone-${command}.png` });
   await page.getByRole('button', { name: command === 'model' ? 'Close Choose your AI' : command === 'effort' ? 'Done setting thinking effort' : 'Close command result', exact: true }).click();
 }
 probe.typing(false); await page.getByText('Typing from your phone is off.', { exact: false }).waitFor();
 await page.getByRole('button', { name: 'Review conversation changes', exact: true }).last().click();
 await page.getByRole('button', { name: /change.txt/ }).click();
 await page.getByText('+after', { exact: true }).waitFor();
 await page.screenshot({ path: '/tmp/vibyra-redesign-phone-diff-readonly.png' });
 console.log('PASS phone command sheets and artifact review while typing is off');
 await writeFile('/tmp/vibyra-redesign-runtime-evidence.json', JSON.stringify({ project: probe.dir, settings: applied, commands: catalogue, items: done.items, usage }, null, 2));
} finally { await browser?.close(); server?.close(); await probe.close(); }
