import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createNotificationsApi } from '../src/notifications/api';
import { openNotification, subscribeNotificationNavigation } from '../src/notifications/navigation';
test('an account switch fences an in-flight inbox response', async () => {
  let token = 'first';
  const api = createNotificationsApi('https://fixture', () => token, async () => {
    token = 'second'; return new Response(JSON.stringify({ items: [{ title: 'private' }] }), { status: 200 });
  });
  await assert.rejects(api.inbox(), /account changed/);
});
test('push navigation authenticates the opaque ID and never performs a decision', async () => {
  const paths: string[] = []; let opened = false;
  const id = '00000000-0000-4000-8000-000000000001';
  const api = createNotificationsApi('https://fixture', () => 'token', async url => {
    paths.push(String(url)); return new Response(JSON.stringify({ item: { destination: { source: 'cloud_turn', runId: 'run', chatId: 'chat' } } }), { status: 200 });
  });
  const unsubscribe = subscribeNotificationNavigation(d => { opened = d.chatId === 'chat'; });
  await openNotification(api, id); unsubscribe();
  assert.equal(opened, true); assert.equal(paths.length, 2); assert.ok(paths[1].endsWith('/read'));
  await assert.rejects(openNotification(api, 'https://attacker'), /Invalid notification/);
});
