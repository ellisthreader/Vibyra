import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validPreviewTarget } from '../src/preview/types';

test('unapproved targets must be native view-only candidates, never websites or control', () => {
  const target = { grantId: 'a'.repeat(32), projectId: 'one', targetId: 'native-window:1:2:view', approvalRequired: true };
  assert.equal(validPreviewTarget(target), true);
  for (const targetId of ['native-window:1:2:control', 'auto-port:3000', 'native-window:0:2:view']) {
    assert.equal(validPreviewTarget({ ...target, targetId }), false);
  }
  assert.equal(validPreviewTarget({ ...target, grantId: 'untrusted' }), false);
  assert.equal(validPreviewTarget(null), false);
});
