import { useState } from "react";

import { writeClipboardText } from "../../ipc/tools";

/**
 * A fenced block, with the one action anyone wants from it.
 *
 * Copy goes through the native clipboard rather than `navigator.clipboard`,
 * which is what the terminal already does — one clipboard for the whole app,
 * and no permission prompt inside a webview.
 *
 * The label is the fence's own language string, shown as written. Guessing a
 * prettier name for it would be inventing information: a block fenced `sh` and
 * a block fenced `bash` were written differently and it is not this component's
 * place to decide they are the same.
 */
export function CodeBlock({
  language,
  text,
  open,
}: {
  language: string;
  text: string;
  /** The closing fence has not arrived — this block is still streaming. */
  open: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await writeClipboardText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_400);
    } catch {
      // A failed copy says nothing: the text is on screen and selectable, and
      // an error toast for it would be louder than the problem.
    }
  };

  return (
    <div className={`code-block ${open ? "is-open" : ""}`}>
      <div className="code-block__head">
        <span className="code-block__lang">{language || "text"}</span>
        <button
          type="button"
          className="code-block__copy"
          onClick={() => void copy()}
          aria-label={copied ? "Copied" : "Copy this block"}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        <code>{text}</code>
      </pre>
    </div>
  );
}
