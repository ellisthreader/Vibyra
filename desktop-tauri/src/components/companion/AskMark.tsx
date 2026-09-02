/**
 * Ask's mark: three bars of a voice, in the `ask` hue.
 *
 * It replaced a literal "?" glyph in a bordered tile, which read as a missing
 * character or a help button rather than as an assistant — and said nothing
 * about the one thing that makes this panel different from a text box, which
 * is that you can talk to it. The shape is the orb's, reduced to a favicon.
 */
export function AskMark() {
  return (
    <span className="ask-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round">
        <path d="M6 10v4" strokeWidth="2.2" />
        <path d="M12 5.5v13" strokeWidth="2.2" />
        <path d="M18 8.5v7" strokeWidth="2.2" />
      </svg>
    </span>
  );
}
