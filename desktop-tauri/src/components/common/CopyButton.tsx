import { useEffect, useRef, useState } from "react";

/** Long enough to read the confirmation, short enough not to keep claiming it. */
const RESET_MS = 1600;

/** The one clipboard button. Every hand-rolled copy in the app flipped a label
 * and told a screen reader nothing, which is the real reason this is shared.
 * `value` may be a thunk so a caller can serialise only once it is clicked. */
export function CopyButton({
  value,
  label = "Copy",
  done = "Copied",
  compact,
  className,
}: {
  value: string | (() => string);
  label?: string;
  done?: string;
  compact?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = () => {
    void navigator.clipboard
      .writeText(typeof value === "function" ? value() : value)
      .then(() => {
        setCopied(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), RESET_MS);
      })
      /* A refused clipboard must not claim success; the label simply stays put. */
      .catch(() => setCopied(false));
  };
  const classes = ["copy-btn", compact ? "copy-btn--compact" : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <button type="button" className={classes} aria-label={copied ? done : label} onClick={copy}>
      {copied ? done : label}
      <span className="sr-only" role="status">{copied ? done : ""}</span>
    </button>
  );
}
