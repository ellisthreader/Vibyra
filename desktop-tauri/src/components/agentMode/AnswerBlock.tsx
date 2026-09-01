import { memo, useMemo } from "react";

import { parseAnswer, type InlineSpan, type MarkdownBlock } from "../../lib/agentMarkdown.ts";
import { CodeBlock } from "./CodeBlock";

/**
 * What the agent said, rendered.
 *
 * Before this the answer was one paragraph with `white-space: pre-wrap`, so
 * every heading, list and fence arrived as the characters the model typed.
 *
 * Memoized on the text, which is what makes streaming affordable: the deltas
 * of one turn land in the last block, and every settled block above it keeps
 * its parse and its elements across the frame.
 *
 * Links render as text, never as anchors. There is no opener plugin in this
 * build, and an anchor that navigates the webview would replace the running
 * app with a web page — the URL is shown, and opening it is a follow-up that
 * needs `plugin-opener` to do properly.
 */
function Spans({ spans }: { spans: InlineSpan[] }) {
  return (
    <>
      {spans.map((span, index) => {
        if (span.kind === "strong") return <strong key={index}>{span.text}</strong>;
        if (span.kind === "em") return <em key={index}>{span.text}</em>;
        if (span.kind === "code") return <code key={index}>{span.text}</code>;
        if (span.kind === "link") {
          return (
            <span key={index} className="answer__link" title={span.href}>
              {span.text}
            </span>
          );
        }
        return <span key={index}>{span.text}</span>;
      })}
    </>
  );
}

function Block({ block }: { block: MarkdownBlock }) {
  switch (block.kind) {
    case "heading": {
      const Tag = `h${block.level}` as "h2" | "h3" | "h4";
      return (
        <Tag className="answer__heading">
          <Spans spans={block.spans} />
        </Tag>
      );
    }
    case "list":
      return block.ordered ? (
        <ol className="answer__list">
          {block.items.map((item, index) => (
            <li key={index}>
              <Spans spans={item} />
            </li>
          ))}
        </ol>
      ) : (
        <ul className="answer__list">
          {block.items.map((item, index) => (
            <li key={index}>
              <Spans spans={item} />
            </li>
          ))}
        </ul>
      );
    case "quote":
      return (
        <blockquote className="answer__quote">
          <Spans spans={block.spans} />
        </blockquote>
      );
    case "code":
      return <CodeBlock language={block.language} text={block.text} open={block.open} />;
    case "rule":
      return <hr className="answer__rule" />;
    default:
      return (
        <p className="answer__p">
          <Spans spans={block.spans} />
        </p>
      );
  }
}

export const AnswerBlock = memo(function AnswerBlock({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}) {
  const blocks = useMemo(() => parseAnswer(text), [text]);
  const lastIsCode = blocks[blocks.length - 1]?.kind === "code";

  return (
    <div className={`answer ${streaming && !lastIsCode ? "is-streaming" : ""}`}>
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  );
});
