import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const launcher = readFileSync(new URL('./start-production.sh', import.meta.url), 'utf8');

for (const role of ['web', 'all']) {
  test(`${role} launches concurrent web workers with Laravel reload disabled`, () => {
    const cwd = mkdtempSync(join(tmpdir(), 'vibyra-web-workers-'));
    try {
      // Capture what the actual launcher hands PHP, including inherited env.
      writeFileSync(join(cwd, 'php'), '#!/bin/sh\nprintf "%s|%s\\n" "$PHP_CLI_SERVER_WORKERS" "$*"\n', { mode: 0o755 });
      const result = spawnSync('bash', ['-c', `
        wait() {
          if [[ "$1" == "-n" ]]; then builtin wait "$2"; else builtin wait "$@"; fi
        }
        ${launcher}
      `], { cwd, encoding: 'utf8', timeout: 5000,
        env: { ...process.env, PATH: `${cwd}:${process.env.PATH}`, VIBYRA_PROCESS_ROLE: role,
          VIBYRA_RUN_MIGRATIONS: '0', VIBYRA_WEB_WORKERS: '8', PORT: '8000' } });
      assert.equal(result.error, undefined);
      assert.match(result.stdout, /8\|artisan serve --host=0\.0\.0\.0 --port=8000 --no-reload/);
      assert.equal(result.status, role === 'web' ? 0 : 1, result.stderr);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
}

// Run the real launcher with external PHP processes and their completion
// mocked. This also runs on macOS Bash 3, which lacks the Linux wait -n builtin.
for (const [childStatus, expected] of [[0, 1], [42, 42]]) {
  test(`all role reports child exit ${childStatus} as restartable failure`, () => {
    const cwd = mkdtempSync(join(tmpdir(), 'vibyra-process-test-'));
    try {
      const result = spawnSync('bash', ['-c', `
        php() { return 0; }
        wait() {
          if [[ "$1" == "-n" ]]; then return ${childStatus}; fi
          builtin wait "$@"
        }
        ${launcher}
      `], {
        cwd,
        env: { ...process.env, VIBYRA_PROCESS_ROLE: 'all', VIBYRA_RUN_MIGRATIONS: '0' },
        encoding: 'utf8',
        timeout: 5000,
      });
      assert.equal(result.error, undefined);
      assert.equal(result.status, expected, result.stderr);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
}
