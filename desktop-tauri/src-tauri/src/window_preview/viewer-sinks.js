// The hidden fields that take the iOS keyboard for the shared window. iOS
// reads a field's keyboard settings when it gains focus, so a different
// keyboard (email, numbers, search, password, several lines) means moving to
// another hidden field. Capitalisation alone never moves: moving focus before
// the keyboard is up cancels it on slower phones.

const MODES = { email: 'email', url: 'url', tel: 'tel', number: 'numeric', search: 'search' };

function keyboardFor(kind) {
  const words = kind === 'text' || kind === 'multiline';
  return { mode: MODES[kind] ?? 'text', enter: kind === 'search' ? 'search' : 'enter', correct: words ? 'on' : 'off' };
}

export function createSinks() {
  const [first, second, secret, area] = ['#sinkA', '#sinkB', '#sinkSecret', '#sinkArea'].map(id => document.querySelector(id));

  /** The field for `kind`: `current` when its keyboard already fits, otherwise another, set up. */
  function pick(kind, empty, current) {
    if (kind === 'secure') return secret;
    if (kind === 'multiline') return area;
    const keyboard = keyboardFor(kind), wanted = JSON.stringify(keyboard);
    if ((current === first || current === second) && current.dataset.keyboard === wanted) return current;
    const next = current === first ? second : first;
    Object.assign(next, { inputMode: keyboard.mode, enterKeyHint: keyboard.enter, spellcheck: keyboard.correct === 'on' });
    next.setAttribute('autocorrect', keyboard.correct);
    // A field that already holds text is usually continued mid-sentence.
    next.setAttribute('autocapitalize', keyboard.correct === 'on' && empty !== false ? 'sentences' : 'off');
    next.dataset.keyboard = wanted;
    return next;
  }

  return { all: [first, second, secret, area], pick };
}
