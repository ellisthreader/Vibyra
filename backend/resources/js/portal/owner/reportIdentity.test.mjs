import test from 'node:test';
import assert from 'node:assert/strict';
import { reportForIdentity } from './reportIdentity.js';

test('private analytics disappear immediately on logout or account replacement', () => {
  const report = { userId: 17, data: { privateCounts: 81 }, updatedAt: new Date() };
  assert.equal(reportForIdentity(report, 17), report);
  assert.equal(reportForIdentity(report, 22), null);
  assert.equal(reportForIdentity(report, null), null);
  assert.equal(reportForIdentity(report, undefined), null);
  assert.equal(reportForIdentity(null, 17), null);
});
