import { useEffect, useRef, useState } from "react";

import { adoptAsIs, cancelProjectCreate, runProjectCreate } from "../../../lib/projectCreateRun";
import { useProjectCreateStore } from "../../../state/projectCreateStore";

/** The build. One line of progress, the log a click away, and a failure that
 * leaves the folder alone and offers a way out rather than an apology. */
export function ScaffoldRunView() {
  const phase = useProjectCreateStore((state) => state.phase);
  const progress = useProjectCreateStore((state) => state.progress);
  const log = useProjectCreateStore((state) => state.log);
  const error = useProjectCreateStore((state) => state.error);
  const close = useProjectCreateStore((state) => state.close);
  const [expanded, setExpanded] = useState(false);
  const tail = useRef<HTMLPreElement>(null);
  const running = phase === "running";

  useEffect(() => {
    if (expanded && tail.current) tail.current.scrollTop = tail.current.scrollHeight;
  }, [expanded, log]);

  return (
    <div className="np-run">
      <div className={`np-run__bar ${running ? "np-run__bar--live" : ""}`} aria-hidden="true">
        <i />
      </div>
      <p className="np-run__step" role="status">
        {running
          ? progress
            ? `${progress.label}… (${progress.index + 1} of ${progress.total})`
            : "Getting the folder ready…"
          : error ?? "Done."}
      </p>
      {running && log.length > 0 ? (
        <code className="np-run__tail">{log[log.length - 1]}</code>
      ) : null}

      {log.length > 0 ? (
        <button className="np-run__toggle" type="button" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Hide output" : `Show output (${log.length} lines)`}
        </button>
      ) : null}
      {expanded ? <pre className="np-run__log" ref={tail}>{log.join("\n")}</pre> : null}

      <div className="np-skip">
        {running ? (
          <button className="btn" type="button" onClick={cancelProjectCreate}>
            Cancel
          </button>
        ) : (
          <>
            <button className="btn" type="button" onClick={close}>
              Close
            </button>
            {phase === "stalled" ? (
              <button className="btn btn--primary" type="button" onClick={() => adoptAsIs(true)}>
                Open it in a terminal
              </button>
            ) : log.length > 0 ? (
              // Something was already written into the folder, so a second run
              // would only be refused for finding files there.
              <button className="btn btn--primary" type="button" onClick={() => adoptAsIs(false)}>
                Open the folder anyway
              </button>
            ) : (
              <button
                className="btn btn--primary"
                data-autofocus
                type="button"
                onClick={() => void runProjectCreate()}
              >
                Try again
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
