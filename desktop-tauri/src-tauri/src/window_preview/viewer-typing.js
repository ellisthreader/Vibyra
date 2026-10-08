// Live typing as keystrokes. The phone types into a hidden field; every change
// to that field (a letter, autocorrect, a QuickType word, dictation, paste,
// delete) becomes the keys that make the same change in the shared window.
// Pure functions, so they are tested without a browser.

const segmenter = globalThis.Intl?.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

/** Character boundaries as a person sees them: an emoji or an accented letter is one. */
function boundaries(text) {
  const marks = new Set([0, text.length]);
  if (segmenter) for (const { index } of segmenter.segment(text)) marks.add(index);
  else { let at = 0; for (const character of text) { marks.add(at); at += character.length; } }
  return marks;
}

/** How many user-perceived characters `text` holds: one arrow press or delete each. */
export function graphemes(text) {
  if (!text) return 0;
  if (segmenter) { let count = 0; for (const _ of segmenter.segment(text)) count++; return count; }
  return Array.from(text).length;
}

const snapBack = (text, index) => { const marks = boundaries(text); while (index > 0 && !marks.has(index)) index--; return index; };
const snapAhead = (text, index) => { const marks = boundaries(text); while (index < text.length && !marks.has(index)) index++; return index; };

function key(actions, name, times) {
  if (times <= 0) return;
  const last = actions.at(-1);
  if (last?.key === name && last.repeat + times <= 200) last.repeat += times;
  else for (let left = times; left > 0; left -= 200) actions.push({ key: name, repeat: Math.min(200, left) });
}

function text(actions, value) {
  // A line break is the Return key: typed as a character, many apps ignore it.
  value.split(/\r\n|\r|\n/).forEach((line, index) => {
    if (index) key(actions, 'enter', 1);
    if (!line) return;
    const last = actions.at(-1);
    if (last?.text !== undefined && last.text.length + line.length <= 256) last.text += line;
    else actions.push({ text: line });
  });
}

/** Arrow presses that move the window's text cursor from `from` to `to` within `value`. */
export function planCaret(value, from, to, actions = []) {
  if (to > from) key(actions, 'right', graphemes(value.slice(from, to)));
  else if (to < from) key(actions, 'left', graphemes(value.slice(to, from)));
  return actions;
}

/**
 * The keys that turn `before` into `after` when the window's cursor is at
 * `caret` in `before`. Returns the actions and where the cursor ends up.
 * An edit that reaches the end of the text is retyped from where it starts,
 * so ordinary typing, autocorrect and punctuation never need arrow keys.
 */
export function planEdit(before, after, caret = before.length) {
  let start = 0;
  const shortest = Math.min(before.length, after.length);
  while (start < shortest && before[start] === after[start]) start++;
  let tail = 0;
  while (tail < shortest - start && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  start = Math.min(snapBack(before, start), snapBack(after, start));
  const oldEnd = snapAhead(before, before.length - tail), newEnd = snapAhead(after, after.length - tail);
  tail = Math.min(before.length - oldEnd, after.length - newEnd);
  let end = before.length - tail, insertEnd = after.length - tail;
  // With the cursor at the end, retype the short tail instead of moving over it.
  if (caret === before.length && tail > 0 && graphemes(before.slice(end)) <= 32) { end = before.length; insertEnd = after.length; }
  const actions = [];
  planCaret(before, caret, end, actions);
  key(actions, 'backspace', graphemes(before.slice(start, end)));
  text(actions, after.slice(start, insertEnd));
  return { actions, caret: insertEnd };
}

/** Units of text in a batch, which the computer caps at 512. */
export function textUnits(actions) {
  return actions.reduce((sum, action) => sum + (action.text?.length ?? 0), 0);
}

/** Joins two batches of actions, merging a trailing key or text run where it can. */
export function joinActions(first, second) {
  const joined = first.map(action => ({ ...action }));
  for (const action of second) {
    if (action.text !== undefined) text(joined, action.text);
    else key(joined, action.key, action.repeat ?? 1);
  }
  return joined;
}
