import { useState } from "react";
import { parseRunnable } from "../../lib/runnableCommand";
import { CopyButton } from "../common/CopyButton";
import { highlight } from "./highlight";

export function CodeBlock({
  language,
  code,
  closed,
  onRun,
}: {
  language: string;
  code: string;
  closed: boolean;
  /** Given the command as it will actually be typed and its lines. Resolving
   *  false means the click produced no visible account of itself: the terminal
   *  could not be opened, and the reason went to the workspace banner. */
  onRun?: (command: string, lines: string[]) => void | Promise<boolean>;
}) {
  const [stranded, setStranded] = useState(false);
  // Half a snippet is useless to copy and running half a command is the one
  // genuinely dangerous failure here, so an open fence carries no tools at all
  // — only a caret saying the rest is still coming.
  const label = language.trim();
  const runnable = closed && onRun ? parseRunnable(label, code) : null;
  const run = async () => {
    if (!runnable || !onRun || stranded) return;
    if ((await onRun(runnable.lines.join("\n"), runnable.lines)) !== false) return;
    // Account for the click where it happened; the reason is on the banner.
    setStranded(true);
    window.setTimeout(() => setStranded(false), 4_000);
  };
  return (
    <div className="md-code" data-streaming={closed ? undefined : "true"}>
      {(label || closed) && (
        <header>
          {/* No `Code` fallback chip: a label that says nothing is badge noise. */}
          {label && <span className="md-code__lang">{label}</span>}
          {closed && (
            <span className="md-code__tools">
              <CopyButton value={code} compact />
              {runnable && (
                <button
                  type="button"
                  className="md-run"
                  title="Run this command"
                  onClick={() => void run()}
                >
                  {stranded ? "Couldn’t open a terminal" : "Run"}
                </button>
              )}
            </span>
          )}
        </header>
      )}
      <pre>
        <code>
          {highlight(code)}
          {!closed && <span className="md-code__caret" aria-hidden="true" />}
        </code>
      </pre>
    </div>
  );
}
