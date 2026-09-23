import { memo, type ComponentProps, type ReactNode } from "react";
import type { ListItem, MarkdownBlock, MarkdownDocument } from "../../lib/markdownDocument.ts";
import { CodeBlock } from "./CodeBlock";
import { MarkdownInline } from "./MarkdownInline";
import { MarkdownTable } from "./MarkdownTable";
import "./markdown.css";

/** Read off the one component that uses it, so the pass-through cannot drift
 *  from the handler `CodeBlock` actually calls. */
type RunHandler = ComponentProps<typeof CodeBlock>["onRun"];

/** Depth belongs to the tree, not to a margin: a nested list should be heard as
 *  nested, which a flat list wearing extra padding would never be. */
function ListLevel({ ordered, items, depth }: { ordered: boolean; items: ListItem[]; depth: number }) {
  const Tag = ordered ? "ol" : "ul";
  const nodes: ReactNode[] = [];
  for (let at = 0; at < items.length; at++) {
    let end = at + 1;
    while (end < items.length && items[end].depth > depth) end += 1;
    const item = items[at];
    nodes.push(
      <li key={at} className={item.checked === undefined ? undefined : "md-task-item"}>
        {/* A record of state, never a control: a model must not be able to draw
            something a person can click. */}
        {item.checked !== undefined && (
          <span className="md-task" role="checkbox" aria-checked={item.checked} aria-disabled="true" />
        )}
        <MarkdownInline text={item.text} />
        {end > at + 1 && <ListLevel ordered={ordered} items={items.slice(at + 1, end)} depth={depth + 1} />}
      </li>,
    );
    at = end - 1;
  }
  return <Tag className="md-list">{nodes}</Tag>;
}

type BlockProps = { block: MarkdownBlock; headingOffset: number; onRun?: RunHandler };

/** A streamed reply is re-parsed per delta into fresh but mostly identical
 *  blocks; comparing their content keeps every settled block (and its code
 *  highlighting) out of the render, leaving only the one still growing. */
const sameBlock = (a: BlockProps, b: BlockProps) =>
  a.headingOffset === b.headingOffset && a.onRun === b.onRun &&
  (a.block === b.block || JSON.stringify(a.block) === JSON.stringify(b.block));

const Block = memo(function Block({ block, headingOffset, onRun }: BlockProps): ReactNode {
  if (block.kind === "heading") {
    // A reply's own headings must never outrank the surrounding panel's `h3`.
    const Tag = `h${Math.min(block.heading.level + headingOffset, 6)}` as "h4" | "h5" | "h6";
    return (
      <Tag id={block.heading.id}>
        <MarkdownInline text={block.heading.text} />
      </Tag>
    );
  }
  if (block.kind === "paragraph")
    return (
      <p>
        <MarkdownInline text={block.text} />
      </p>
    );
  if (block.kind === "list") return <ListLevel ordered={block.ordered} items={block.items} depth={0} />;
  if (block.kind === "quote")
    return (
      <blockquote>
        <MarkdownInline text={block.text} />
      </blockquote>
    );
  if (block.kind === "code")
    return <CodeBlock language={block.language} code={block.text} closed={block.closed} onRun={onRun} />;
  if (block.kind === "rule") return <hr className="md-rule" />;
  return <MarkdownTable headers={block.headers} rows={block.rows} alignments={block.alignments} />;
}, sameBlock);

/**
 * The one markdown renderer. `headingOffset` maps the model's `#` to
 * `min(level + offset, 6)`; chat passes 3 so a reply cannot compete with the
 * heading of the panel it is sitting inside.
 */
export const MarkdownBlocks = memo(function MarkdownBlocks({
  doc,
  headingOffset = 3,
  onRun,
}: {
  doc: MarkdownDocument;
  headingOffset?: number;
  onRun?: RunHandler;
}) {
  return (
    <div className="md-doc">
      {/* The parser is prefix-stable, so an index key only ever replaces an
          element React would have replaced for a changed kind anyway. */}
      {doc.blocks.map((block, index) => (
        <Block key={index} block={block} headingOffset={headingOffset} onRun={onRun} />
      ))}
    </div>
  );
});
