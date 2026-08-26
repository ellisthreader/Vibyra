import { PALETTE_SCOPES, type PaletteScope } from "../../lib/paletteQuery";

interface Props {
  scope: PaletteScope;
  count: number;
  onScope: (prefix: string) => void;
}

/**
 * The part that tells you the palette is more than a search box.
 *
 * Every scope has a one-character prefix, and nobody guesses a prefix. Putting
 * them on a rail under the list — clickable, so they teach themselves — is the
 * difference between four modes and one.
 */
export function CommandPaletteFooter({ scope, count, onScope }: Props) {
  return (
    <div className="pal__foot">
      <div className="pal__scopes">
        {PALETTE_SCOPES.map((item) => (
          <button
            key={item.prefix}
            type="button"
            className={`pal__scope ${scope === item.scope ? "pal__scope--on" : ""}`}
            onClick={() => onScope(item.prefix)}
          >
            <span className="pal__scope-key">{item.prefix}</span>
            {item.label}
          </button>
        ))}
      </div>
      <div className="pal__keys">
        <span>{count} result{count === 1 ? "" : "s"}</span>
        <kbd className="kbd">↑↓</kbd>
        <kbd className="kbd">↵</kbd>
        <kbd className="kbd">esc</kbd>
      </div>
    </div>
  );
}
