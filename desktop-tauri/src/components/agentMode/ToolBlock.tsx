import type { TranscriptBlock } from "../../lib/agentEventReducer";

/**
 * A tool call and its answer, as one block.
 *
 * Folded by default once it has finished successfully: the output of a command
 * that worked is rarely what the reader came for, and a transcript of open
 * `cat` output is a transcript nobody scrolls. A failure stays open, because
 * that one *is* what they came for.
 */
export function ToolBlock({ block }: { block: Extract<TranscriptBlock, { type: "tool" }> }) {
  const hasOutput = Boolean(block.output && block.output.trim());

  return (
    <div className={`tool-block ${block.failed ? "is-failed" : ""}`}>
      <div className="tool-block__head">
        <span className="tool-block__name">{block.tool || "tool"}</span>
        {block.summary && <code className="tool-block__summary">{block.summary}</code>}
        {block.running && <span className="activity-dot" title="Running" />}
        {block.exitCode !== null && block.exitCode !== 0 && (
          <span className="tool-block__exit">exit {block.exitCode}</span>
        )}
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
