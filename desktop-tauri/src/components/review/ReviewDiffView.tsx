import { useState } from "react";

/** Rows past this render behind a click, so a huge diff can't stall the dock. */
const VISIBLE_LINES = 400;

type LineKind = "add" | "del" | "hunk" | "meta" | "context";

function kindOf(line: string): LineKind {
  if (line.startsWith("+++") || line.startsWith("---")) return "meta";
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("new file") || line.startsWith("deleted file")) {
    return "meta";
  }
  return "context";
}

/**
 * A unified diff, straight from git, coloured by prefix. No parsing beyond
 * the first character of each line: git already formatted it for reading.
 */
export function ReviewDiffView({ diff }: { diff: string }) {
  const [showAll, setShowAll] = useState(false);
  const lines = diff.replace(/\n$/, "").split("\n");
  const visible = showAll ? lines : lines.slice(0, VISIBLE_LINES);

  return (
    <div className="review-diff">
      <pre>
        {visible.map((line, index) => (
          <span key={index} className={`review-diff__line review-diff__line--${kindOf(line)}`}>
            {line || " "}
          </span>
        ))}
      </pre>
      {!showAll && lines.length > VISIBLE_LINES && (
        <button type="button" className="review-diff__more" onClick={() => setShowAll(true)}>
          Show all {lines.length.toLocaleString()} lines
        </button>
      )}
    </div>
  );
}
