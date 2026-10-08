import assert from 'node:assert/strict';
import test from 'node:test';
import { graphemes, joinActions, planCaret, planEdit, textUnits } from '../src-tauri/src/window_preview/viewer-typing.js';

// Applies actions to a simulated text field the way a real app would, to
// prove each plan produces exactly the phone's text.
function apply(value, caret, actions) {
  const chars = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value), part => part.segment);
  let at = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value.slice(0, caret))).length;
  for (const action of actions) {
    if (action.text !== undefined) {
      const typed = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(action.text), part => part.segment);
      chars.splice(at, 0, ...typed); at += typed.length; continue;
    }
    for (let i = 0; i < (action.repeat ?? 1); i++) {
      if (action.key === 'backspace' && at > 0) { chars.splice(at - 1, 1); at--; }
      else if (action.key === 'left') at = Math.max(0, at - 1);
      else if (action.key === 'right') at = Math.min(chars.length, at + 1);
      else if (action.key === 'enter') { chars.splice(at, 0, '\n'); at++; }
    }
  }
  return { value: chars.join(''), caret: chars.slice(0, at).join('').length };
}

function check(before, after, caret = before.length) {
  const plan = planEdit(before, after, caret);
  const result = apply(before, caret, plan.actions);
  // Return inserts one line break, as text fields store it.
  const expected = after.replace(/\r\n?/g, '\n');
  assert.equal(result.value, expected, `${JSON.stringify(before)} → ${JSON.stringify(after)} via ${JSON.stringify(plan.actions)}`);
  if (expected === after) assert.equal(result.caret, plan.caret, 'the plan knows where the cursor ends');
  return plan;
}

test('ordinary typing is one text action and no arrows', () => {
  assert.deepEqual(check('', 'J').actions, [{ text: 'J' }]);
  assert.deepEqual(check('Ji', 'J').actions, [{ key: 'backspace', repeat: 1 }]);
  assert.deepEqual(check('Teh teh', 'Teh teh ').actions, [{ text: ' ' }]);
});

test('QuickType and autocorrect replacements (captured on iOS 26.5) type only the difference', () => {
  assert.deepEqual(check('Teh teh hel', 'Teh teh help').actions, [{ text: 'p' }]);
  const corrected = check('I saw teh', 'I saw the');
  assert.ok(!corrected.actions.some(action => action.key === 'left' || action.key === 'right'), JSON.stringify(corrected.actions));
  check('J teh teh', 'J teh');
});

test('smart punctuation mid-text is retyped from the change, never arrowed over', () => {
  const plan = check('hi ', 'hi. ');
  assert.deepEqual(plan.actions, [{ key: 'backspace', repeat: 1 }, { text: '. ' }]);
});

test('emoji, flags, families and accents are whole characters', () => {
  check('', '👨‍👩‍👧 ok');
  check('😀', '😁');
  check('e', 'é');
  check('🇬🇧', '');
  assert.equal(graphemes('👨‍👩‍👧🇬🇧é'), 3);
  const plan = check('a👍🏽', 'a');
  assert.deepEqual(plan.actions, [{ key: 'backspace', repeat: 1 }]);
});

test('line breaks become Return', () => {
  assert.deepEqual(check('a', 'a\nb').actions, [{ key: 'enter', repeat: 1 }, { text: 'b' }]);
  check('', 'one\r\ntwo\n\nthree');
});

test('an edit before the cursor end moves with arrows when the tail is long', () => {
  const long = 'x'.repeat(40);
  const plan = check(`a${long}`, `ab${long}`, 1);
  assert.deepEqual(plan.actions, [{ text: 'b' }]);
  const later = check(`ab${long}`, `a${long}`, 42);
  assert.ok(later.actions.some(action => action.key === 'left'));
});

test('paste, select-all delete and dictation replacements round-trip', () => {
  check('draft', 'draft pasted text from clipboard');
  check('delete all of this', '');
  check('recognise speech', 'recognize speech');
  for (let i = 0; i < 300; i++) {
    const pool = ['a', 'b', ' ', 'é', '👍', '\n', 'Z'];
    const make = () => Array.from({ length: Math.floor(Math.random() * 12) }, () => pool[Math.floor(Math.random() * pool.length)]).join('');
    check(make(), make());
  }
});

test('cursor moves count characters, and batches merge within limits', () => {
  assert.deepEqual(planCaret('a👍b', 3, 0), [{ key: 'left', repeat: 2 }]);
  assert.deepEqual(planCaret('ab', 0, 2), [{ key: 'right', repeat: 2 }]);
  const joined = joinActions([{ text: 'ab' }, { key: 'backspace', repeat: 1 }], [{ key: 'backspace', repeat: 2 }, { text: 'c' }]);
  assert.deepEqual(joined, [{ text: 'ab' }, { key: 'backspace', repeat: 3 }, { text: 'c' }]);
  assert.equal(textUnits(joined), 3);
  const many = planEdit('x'.repeat(450), '');
  assert.deepEqual(many.actions, [{ key: 'backspace', repeat: 200 }, { key: 'backspace', repeat: 200 }, { key: 'backspace', repeat: 50 }]);
});
