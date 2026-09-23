/** A shortcut drawn as the keys you actually press: one raised cap each, in
 * order. The caps are the whole statement, so the row reads as a keyboard
 * rather than as a line of code. */
export function KeyCaps({ caps, className = "" }: { caps: string[]; className?: string }) {
  return (
    <span className={`keycaps ${className}`.trim()}>
      {caps.map((cap, index) => (
        <kbd key={`${cap}-${index}`} className="kbd">{cap}</kbd>
      ))}
    </span>
  );
}
