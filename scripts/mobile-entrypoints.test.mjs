import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const json = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));

test('the repository exposes only the maintained mobile application', () => {
  for (const retired of ['src', 'App.tsx', 'app.json', 'app.config.js', 'eas.json', 'babel.config.js']) {
    assert.equal(existsSync(resolve(root, retired)), false, `Retired entry point returned: ${retired}`);
  }
  const scripts = json('package.json').scripts;
  for (const command of ['start', 'phone', 'dev', 'web', 'ios', 'android', 'typecheck', 'check:mobile']) {
    assert.match(scripts[command], /^npm --prefix mobile run /, command);
  }
  assert.equal(json('mobile/package.json').main, 'index.ts');
  assert.match(readFileSync(resolve(root, 'mobile/src/onboarding/WelcomeStep.tsx'), 'utf8'), /your pocket/);
  assert.equal(existsSync(resolve(root, 'mobile/src/onboarding/WelcomeScreen.tsx')), false);
});
