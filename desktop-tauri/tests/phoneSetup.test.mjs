import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hostSetupCommand } from '../src/lib/phoneSetup.ts';

test('setup accepts private LAN addresses and rejects incomplete or injected inputs', () => {
  assert.match(hostSetupCommand('linux', '/tmp/project', '192.168.1.20'), /--public-url ws:\/\/192.168.1.20:4318 --pair$/);
  assert.match(hostSetupCommand('windows', 'C:\\Projects\\app', '10.0.0.4'), /^& '\.\\Vibyra-Host/);
  for (const address of ['8.8.8.8', 'localhost', '192.168.1.999', '192.168.1.1;touch bad', '127.0.0.1']) {
    assert.throws(() => hostSetupCommand('linux', '/tmp/project', address), /private Wi-Fi/);
  }
  for (const path of ['', 'relative', '/tmp/a\ncommand']) assert.throws(() => hostSetupCommand('linux', path, '10.0.0.1'));
  assert.throws(() => hostSetupCommand('windows', '/tmp/a', '10.0.0.1'), /full path/);
});

test('Linux command passes shell punctuation as a literal project argument', { skip: process.platform === 'win32' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'vibyra-phone-command-'));
  try {
    writeFileSync(join(dir, 'Vibyra-Host-0.6.0-preview-linux-x86_64'), '#!/bin/sh\nprintf "%s\\0" "$@"\n', { mode: 0o600 });
    const path = "/tmp/it’s a 'project'; $(printf INJECTED) `printf INJECTED`";
    const output = execFileSync('bash', ['-c', hostSetupCommand('linux', path, '10.2.3.4')], { cwd: dir }).toString().split('\0');
    assert.deepEqual(output, ['--project', path, '--listen', '0.0.0.0:4318', '--public-url', 'ws://10.2.3.4:4318', '--pair', '']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('PowerShell preserves project quotes and does not interpolate dollar expressions', () => {
  const command = hostSetupCommand('windows', "C:\\My project's\\$(Write-Output injected)", '172.16.1.4');
  assert.ok(command.includes("--project 'C:\\My project''s\\$(Write-Output injected)'"));
});
