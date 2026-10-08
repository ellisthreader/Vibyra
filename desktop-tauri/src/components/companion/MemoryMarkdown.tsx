import { createElement, Fragment } from "react";

import type { MemoryDocumentModel } from "../../lib/memoryDocument";

function inline(text: string, onWikiLink?: (target: string) => void) {
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(pattern).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("[[") && part.endsWith("]]")) {
      const target = part.slice(2, -2);
      return onWikiLink ? (
        <button className="memory-wikilink" key={index} onClick={() => onWikiLink(target)}>
          {target.split("|").at(-1)}
        </button>
      ) : <span className="memory-reference" key={index}>{target}</span>;
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      return <span className="memory-reference" title={link[2]} key={index}>{link[1]}</span>;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export function MemoryMarkdown({
  model,
  emptyCopy,
  onWikiLink,
}: {
  model: MemoryDocumentModel;
  emptyCopy: string;
  onWikiLink?: (target: string) => void;
}) {
  if (!model.blocks.length) {
    return <div className="memory-document-empty">{emptyCopy}</div>;
  }
  return (
    <article className="memory-markdown">
      {model.blocks.map((block, index) => {
        if (block.kind === "heading") {
          const level = Math.min(block.heading.level + 1, 6);
          return createElement(
            `h${level}`,
            { id: block.heading.id, key: `${block.heading.id}-${index}` },
            inline(block.heading.text, onWikiLink),
          );
        }
        if (block.kind === "paragraph") return <p key={index}>{inline(block.text, onWikiLink)}</p>;
        if (block.kind === "quote") return <blockquote key={index}>{inline(block.text, onWikiLink)}</blockquote>;
        if (block.kind === "rule") return <hr key={index} />;
        if (block.kind === "code") {
          return <pre key={index} data-language={block.language}><code>{block.text}</code></pre>;
        }
        const List = block.ordered ? "ol" : "ul";
        return (
          <List key={index}>
            {block.items.map((item, itemIndex) => <li key={itemIndex}>{inline(item, onWikiLink)}</li>)}
          </List>
        );
      })}
    </article>
  );
}
