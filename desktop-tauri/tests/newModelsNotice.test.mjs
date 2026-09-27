import assert from 'node:assert/strict';
import test from 'node:test';

import { hideNewModelsNotice, MODEL_NOTICE_CAMPAIGN, newModelsNoticeHidden } from '../src/lib/newModelsNotice.ts';

function storage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

const activeDay = Date.parse('2026-09-23T12:00:00Z');
const day = 24 * 60 * 60 * 1000;

test('a dismissal applies only to its model campaign', () => {
  const store = storage();
  const next = { id:'next-major-release', latestReleaseDate:'2026-09-23' };
  assert.equal(newModelsNoticeHidden(MODEL_NOTICE_CAMPAIGN, store, activeDay), false);
  hideNewModelsNotice(MODEL_NOTICE_CAMPAIGN, store);
  assert.equal(newModelsNoticeHidden(MODEL_NOTICE_CAMPAIGN, store, activeDay), true);
  assert.equal(newModelsNoticeHidden(next, store, activeDay), false);
  hideNewModelsNotice(next, store);
  assert.equal(newModelsNoticeHidden(next, store, activeDay), true);
});

test('old notices expire and prior dismissal remains honored', () => {
  const store = storage();
  const releaseDay = Date.parse(`${MODEL_NOTICE_CAMPAIGN.latestReleaseDate}T00:00:00Z`);
  assert.equal(newModelsNoticeHidden(MODEL_NOTICE_CAMPAIGN, store, releaseDay - 1), true);
  assert.equal(newModelsNoticeHidden(MODEL_NOTICE_CAMPAIGN, store, releaseDay + 45 * day), true);
  store.setItem('vibyra.desktop.newModels2026.hidden', 'true');
  const original = { id:'2026-09-gpt-6-claude-opus-5-5', latestReleaseDate:'2026-09-22' };
  assert.equal(newModelsNoticeHidden(original, store, activeDay), true);
  const next = { id:'next-major-release', latestReleaseDate:'2026-09-23' };
  assert.equal(newModelsNoticeHidden(next, store, activeDay), false);
});
