import type { TranscriptBlock } from "../../lib/agentEventReducer";
import { toolElapsed, toolShape } from "../../lib/agentToolShape.ts";

/**
 * A tool call and its answer, as one block.
 *
 * Read as a column, which is how a turn with a dozen of them is actually read.
 * Three fields in fixed positions — what it did, what it did it to, how that
 * went — so the one that failed is findable without opening anything. Before
 * this the head was an uppercased raw tool name and a truncated command, which
 * made six calls six identical grey boxes.
 *
 * Folded by default once it has finished successfully: the output of a command
 * that worked is rarely what the reader came for. A failure stays open,
 * because that one *is* what they came for.
 */
export function ToolBlock({ block }: { block: Extract<TranscriptBlock, { type: "tool" }> }) {
  const hasOutput = Boolean(block.output && block.output.trim());
  const { verb, target } = toolShape(block.tool, block.summary);
  const elapsed = toolElapsed(block.startedMs, block.endedMs);

  return (
    <div className={`tool-block ${block.failed ? "is-failed" : ""}`}>
      <div className="tool-block__head">
        <span className="tool-block__verb">{verb}</span>
        {target && (
          <code className="tool-block__target" title={block.summary}>
            {target}
          </code>
        )}
        <span className="tool-block__outcome">
          {block.running ? (
            <span className="activity-dot" title="Running" />
          ) : (
            <>
              {block.exitCode !== null && block.exitCode !== 0 && (
                <b className="tool-block__exit">exit {block.exitCode}</b>
              )}
              {block.failed && block.exitCode === null && <b className="tool-block__exit">failed</b>}
              {elapsed && <span className="tool-block__time">{elapsed}</span>}
            </>
          )}
        </span>
      </div>
      {hasOutput && (
        <details className="tool-block__output" open={block.failed}>
          <summary>{block.failed ? "What went wrong" : "Output"}</summary>
          <pre>{block.output}</pre>
        </details>
      )}
    </div>
  );
}
