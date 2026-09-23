import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { samePreparedExecution } from '../src/vibes/autoPreparation';
import type { VibesQuote } from '../src/vibes/types';
const quote: VibesQuote = { quote: 'signed', model: 'fixture', effort: 'low', maxCredits: 5, estimatedCredits: 5, expiresAt: 10 };
test('preparation ignores refreshed token but reviews any execution or price change', () => {
  assert.equal(samePreparedExecution(quote, { ...quote, quote: 'new', expiresAt: 20 }), true);
  for (const change of [{ model: 'other' }, { effort: 'high' as const }, { maxCredits: 4 }, { maxCredits: 6 }, { integrations: ['github'] }]) {
    assert.equal(samePreparedExecution(quote, { ...quote, ...change }), false);
  }
});
