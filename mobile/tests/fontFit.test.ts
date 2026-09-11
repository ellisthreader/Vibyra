import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_FONT_SIZE, MAX_FONT_SIZE, MIN_COLUMNS, MIN_FONT_SIZE,
  clampFontSize, columnsFor, sizeForWidth,
} from '../src/terminal/fontFit';

// Menlo advances 0.6 of its font size per cell; measured at 6.007px for 10px type.
const menlo = 0.6007;
// 390pt phone less the terminal's 12px side padding.
const PHONE = 366;

test('a phone opens at a readable size, and the column count follows from it', () => {
  assert.equal(sizeForWidth(PHONE, menlo), DEFAULT_FONT_SIZE);
  const columns = columnsFor(PHONE, DEFAULT_FONT_SIZE, menlo);
  // ~46 columns. Narrower than the ~92 Claude Code prefers, and that is the
  // honest answer: the computer is told this number and lays out for it, so
  // nothing wraps. Guessing wider is what shredded the screen.
  assert.ok(columns >= 40 && columns <= 50, `expected about 46 columns, got ${columns}`);
});

test('pinching trades columns against legibility, both ways', () => {
  const small = columnsFor(PHONE, MIN_FONT_SIZE, menlo);
  const large = columnsFor(PHONE, MAX_FONT_SIZE, menlo);
  assert.ok(small > large, 'smaller type must buy more columns');
  assert.ok(small >= 55, `the smallest type should still reach a useful width, got ${small}`);
  assert.ok(large >= MIN_COLUMNS, 'even the largest type keeps a usable terminal');
});

test('the type never leaves the range a person can read', () => {
  for (const size of [0, 1, 8, 13, 40, Number.NaN]) {
    const clamped = clampFontSize(size);
    assert.ok(clamped >= MIN_FONT_SIZE && clamped <= MAX_FONT_SIZE, `${size} produced ${clamped}`);
  }
  // 11pt is iOS's smallest system text. The old floor was 10px, which made the
  // terminal the smallest type on a screen whose other text is 16-17.
  assert.equal(MIN_FONT_SIZE, 11);
  assert.ok(clampFontSize(13.3) % 0.5 === 0, 'half-point steps stop a slow pinch thrashing');
});

test('a very narrow surface gives up type size rather than becoming unusable', () => {
  const cramped = sizeForWidth(140, menlo);
  assert.ok(cramped <= DEFAULT_FONT_SIZE, 'a narrow box shrinks the type to keep columns');
  assert.ok(columnsFor(140, cramped, menlo) >= MIN_COLUMNS);
});

test('a missing measurement falls back to something readable, never to zero', () => {
  assert.equal(sizeForWidth(PHONE, 0), DEFAULT_FONT_SIZE);
  assert.equal(sizeForWidth(0, menlo), DEFAULT_FONT_SIZE);
  assert.equal(columnsFor(0, 13, menlo), MIN_COLUMNS);
  assert.equal(columnsFor(PHONE, 0, menlo), MIN_COLUMNS);
});
