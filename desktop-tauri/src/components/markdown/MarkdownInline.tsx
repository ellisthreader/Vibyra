import { Fragment, type ReactNode } from "react";
import { SafeLink } from "./SafeLink";

/** One split, ordered longest-first so `**bold**` is never read as two italics.
 *  Splitting with a capture group leaves runs on the odd indices, which is how
 *  a run is told apart from text that merely starts with the same character. */
const RUNS = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*\n]+\*|_[^_\n]+_|\[[^\]]*\]\([^)]*\))/g;
const LINK = /^\[([^\]]*)\]\(([^)]*)\)$/;
const ESCAPED = /\\([\\`*_~[\]()#|>-])/g;
const WORD = /[\p{L}\p{N}]/u;

const plain = (text: string) => text.replace(ESCAPED, "$1");

/**
 * Model output must never enter an HTML parser: there is no `innerHTML` here
 * and no sanitizer to get wrong. Every run becomes an element instead.
 */
export function MarkdownInline({ text }: { text: string }): ReactNode {
  const parts = text.split(RUNS);
  return parts.map((part, index) => {
    // `MAX_CHARS_PER_MESSAGE` is one identifier, not an italic run in a name.
    const joined = part.startsWith("_") && WORD.test(parts[index - 1]?.slice(-1) ?? "");
    if (index % 2 === 0 || joined) return <Fragment key={index}>{plain(part)}</Fragment>;
    if (part.startsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") || part.startsWith("__"))
      return <strong key={index}>{plain(part.slice(2, -2))}</strong>;
    if (part.startsWith("~~")) return <del key={index}>{plain(part.slice(2, -2))}</del>;
    const link = LINK.exec(part);
    if (link) return <SafeLink key={index} label={plain(link[1])} destination={link[2]} />;
    return <em key={index}>{plain(part.slice(1, -1))}</em>;
  });
}
