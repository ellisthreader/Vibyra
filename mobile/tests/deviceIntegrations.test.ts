import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectedDetail, deviceBlock, deviceIntegrations, obsidianIntegration, railwayIntegration, vaultProject } from '../src/integrations/deviceIntegrations';
import type { DeviceWorkspace } from '../src/integrations/deviceIntegrations';

const mac = { id: 'mac', name: 'Ellis MacBook', platform: 'macos' };
const connected = (over: Partial<DeviceWorkspace> = {}): DeviceWorkspace =>
  ({ status: 'connected', host: mac, projects: [{ id: 'r', name: 'Railway', path: '/virtual', kind: 'railway', filesAvailable: true }], railway: null, ...over });

test('a vault named by the Mac makes Obsidian connected, under the vault name', () => {
  const workspace = connected({ projects: [
    { id: 'p1', name: 'Vibyra', path: '/Users/ellis/Desktop/Vibyra' },
    { id: 'v1', name: 'Notes', path: '/Users/ellis/Notes', kind: 'vault', filesAvailable: true },
  ] });
  assert.equal(vaultProject(workspace)?.id, 'v1');
  const entry = obsidianIntegration(workspace);
  assert.equal(entry.installed, true);
  assert.equal(entry.account, 'Notes');
  assert.equal(entry.credential.kind, 'device');
  assert.equal(entry.writes, null, 'a vault is read-only, so there is no Changes section');
  assert.equal(deviceBlock(entry, workspace), null);
});

test('an older Mac that only says filesAvailable still counts as a vault', () => {
  const workspace = connected({ projects: [{ id: 'v2', name: 'Journal', path: '/j', filesAvailable: true }] });
  assert.equal(vaultProject(workspace)?.name, 'Journal');
});

test('with no vault, Obsidian says what to do on the Mac; with no computer, to connect one first', () => {
  const noVault = obsidianIntegration(connected());
  assert.equal(noVault.installed, false);
  assert.match(deviceBlock(noVault, connected()) ?? '', /Vault folder/);
  const offline: DeviceWorkspace = { status: 'offline', host: null, projects: [], railway: null };
  assert.match(deviceBlock(obsidianIntegration(offline), offline) ?? '', /Connect your computer first/);
  // A vault remembered from a connection that has since dropped is not one now.
  const dropped: DeviceWorkspace = { ...offline, projects: [{ id: 'v', name: 'Notes', path: '/n', kind: 'vault' }] };
  assert.equal(vaultProject(dropped), null);
});

test('Railway follows the Mac CLI report: ready is connected as the account, signed out and missing each say their fix', () => {
  const ready = railwayIntegration(connected({ railway: { status: 'ready', account: 'ellis@example.com' } }));
  assert.equal(ready.installed, true);
  assert.equal(ready.account, 'ellis@example.com');
  const signedOut = railwayIntegration(connected({ railway: { status: 'signedOut', account: null } }));
  assert.equal(signedOut.installed, false);
  assert.match(signedOut.credential.help, /railway login/);
  const missing = railwayIntegration(connected({ railway: { status: 'missing', account: null } }));
  assert.match(missing.credential.help, /npm install -g @railway\/cli/);
  const unknown = railwayIntegration(connected());
  assert.equal(unknown.installed, false, 'a Mac that has not said yet is not connected');
  // and is not told to install what it may already have.
  assert.match(unknown.credential.help, /has not said whether it has the Railway CLI/);
  assert.doesNotMatch(unknown.credential.help, /npm install/);
});

test('both entries carry a mention shape but never claim a server install', () => {
  const entries = deviceIntegrations(connected());
  assert.deepEqual(entries.map(entry => entry.id), ['obsidian', 'railway']);
  for (const entry of entries) {
    assert.equal(entry.mention, '@' + entry.id);
    assert.equal(entry.connectedAt, null);
    assert.equal(entry.credential.kind, 'device');
  }
});

test('a vault is a folder you are connected to, an account is someone you are signed in as', () => {
  const vault = obsidianIntegration(connected({ projects: [{ id: 'v', name: 'Notes', path: '/n', kind: 'vault' }] }));
  assert.equal(connectedDetail(vault), 'Connected to Notes');
  assert.equal(connectedDetail(railwayIntegration(connected({ railway: { status: 'ready', account: 'ellis@example.com' } }))),
    'Connected as ellis@example.com');
  // A server integration the Mac knows nothing about is unchanged by any of this.
  assert.equal(connectedDetail({ ...vault, id: 'github', account: '@ellis' }), 'Connected as @ellis');
  assert.equal(connectedDetail({ ...vault, account: null }), 'Connected');
});

test('CLI readiness without working tools is not connected and never becomes a vault', () => {
  const old = connected({ projects: [], railway: { status: 'ready', account: 'ellis' } });
  assert.equal(railwayIntegration(old).installed, false);
  assert.match(railwayIntegration(old).credential.help, /Update Vibyra/);
  assert.equal(vaultProject(connected()), null);
});
