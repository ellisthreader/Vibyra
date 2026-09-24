import test from 'node:test';
import assert from 'node:assert/strict';
import { probeMacFeeds } from '../scripts/macos-feed-probe.mjs';

test('Mac publication waits for both feeds after Railway redeploy', async () => {
  const plans = [
    { target: { arch: 'arm64', platform: 'macos-arm64' }, entry: { version: '0.8.7', signature: 'arm' } },
    { target: { arch: 'x64', platform: 'macos-x64' }, entry: { version: '0.8.7', signature: 'intel' } },
  ];
  const calls = [];
  const request = async url => {
    calls.push(url);
    if (calls.length <= 2) return { status: 204 };
    return { status: 200, json: async () => ({ version: '0.8.7', signature: url.includes('aarch64') ? 'arm' : 'intel' }) };
  };
  await probeMacFeeds(plans, '0.8.5', 'https://example.test', { request, attempts: 2, delayMs: 0 });
  assert.equal(calls.length, 4);
});
