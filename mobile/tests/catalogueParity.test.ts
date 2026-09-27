import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fallbackIntegrations } from '../src/integrations/catalogue';

/**
 * The backend's `chat_connectors.catalogue` and this app's `fallbackIntegrations`
 * say the same thing in two places on purpose: the fallback is what draws before
 * the server has answered, not a second source of truth free to drift from the
 * first. App/References already flags that the two are kept in step "by eye" -
 * this is the test that replaces the eye. It runs the backend's own config
 * through Artisan and diffs it field by field, so an integration added to one
 * catalogue and not the other fails here rather than shipping as a page that
 * quietly says something the server does not.
 */
const FIELDS = ['name', 'tagline', 'blurb', 'category', 'abilities', 'reads', 'writes'] as const;
const CREDENTIAL_FIELDS = ['label', 'placeholder', 'help', 'url'] as const;

function backendCatalogue(): Record<string, { id: string; name: string; tagline: string; blurb: string; category: string;
  abilities: string[]; reads: string | null; writes: string | null;
  credential: { label: string; placeholder: string; help: string; url: string } }> {
  const backend = resolve('../backend');
  const json = execFileSync('php', ['artisan', 'connectors:catalogue-json'], { cwd: backend, encoding: 'utf8' });
  return JSON.parse(json);
}

test('the mobile fallback catalogue matches the backend catalogue, field by field, in order', () => {
  const backend = backendCatalogue();
  assert.deepEqual(fallbackIntegrations.map(i => i.id), Object.keys(backend),
    'the two catalogues must offer the same integrations, in the same order');
  for (const integration of fallbackIntegrations) {
    const entry = backend[integration.id];
    for (const field of FIELDS) {
      assert.deepEqual(integration[field], entry[field], `${integration.id}.${field} has drifted from the backend catalogue`);
    }
    for (const key of CREDENTIAL_FIELDS) {
      assert.equal(integration.credential[key], entry.credential[key],
        `${integration.id}.credential.${key} has drifted from the backend catalogue`);
    }
  }
});
