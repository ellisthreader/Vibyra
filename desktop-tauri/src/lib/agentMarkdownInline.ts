/** One run of styled text inside a line. */
export type InlineSpan =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "em"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string };

// The inline half of the answer grammar: code, bold, italic, links.
//
// Code is matched before everything else and its contents are never scanned
// again, because `**` inside a backtick span is a literal pair of asterisks —
// which matters the moment a model explains a glob or a pointer type.
//
// Only `http` and `https` survive as links. A `javascript:` href in a webview
// that also runs the app is the one genuinely dangerous thing a model can put
// in a transcript, and an allowlist is the only version of this check that
// cannot be talked around.

const PATTERN =
  /(`+)([\s\S]*?)\1|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|(?<![\w*])\*(?!\s)([^*\n]+?)\*|\[([^\]\n]*)\]\(([^)\s]+)\)/;

function safeHref(href: string): string | null {
  const trimmed = href.trim();
  return /^https?:\/\/[^\s]+$/i.test(trimmed) ? trimmed : null;
}

/**
 * Splits one line into spans.
 *
 * Anything unmatched stays text, including a stray backtick or asterisk. A
 * model mid-sentence produces unbalanced markers constantly while streaming,
 * and swallowing them would make text flicker between styles as it arrives.
 */
export function parseInline(line: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  let rest = line;

  const push = (span: InlineSpan) => {
    const last = spans[spans.length - 1];
    if (span.kind === "text" && last?.kind === "text") last.text += span.text;
    else if (span.kind !== "text" || span.text) spans.push(span);
  };

  while (rest) {
    const match = PATTERN.exec(rest);
    if (!match || match.index === undefined) break;
    if (match.index > 0) push({ kind: "text", text: rest.slice(0, match.index) });

    const [whole, , code, strong, strongAlt, em, linkText, linkHref] = match;
    if (code !== undefined) {
      // Markdown lets one space either side pad a span holding a backtick.
      push({ kind: "code", text: code.replace(/^ (.*) $/, "$1") });
    } else if (strong !== undefined || strongAlt !== undefined) {
      push({ kind: "strong", text: (strong ?? strongAlt) as string });
    } else if (em !== undefined) {
      push({ kind: "em", text: em });
    } else if (linkText !== undefined && linkHref !== undefined) {
      const href = safeHref(linkHref);
      if (href) push({ kind: "link", text: linkText || href, href });
      else push({ kind: "text", text: whole });
    }
    rest = rest.slice(match.index + whole.length);
  }

  if (rest) push({ kind: "text", text: rest });
  return spans;
}
