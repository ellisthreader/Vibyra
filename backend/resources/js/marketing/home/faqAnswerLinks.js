const LINK_PATTERN = /\/#(?:pricing|mobile|desktop|faq|why|walkthrough)|\/legal\/(?:privacy|terms)|\/(?:downloads|benchmarks|account|signup|login)|hello@vibyra\.com/gi;
const ADDRESS_PART = /[\p{L}\p{N}_/@:#?\-]/u;

/* Only turn known Vibyra destinations into links. The answer remains plain text. */
export function faqAnswerLinks(text) {
    const parts = [];
    let cursor = 0;

    for (const match of text.matchAll(LINK_PATTERN)) {
        const start = match.index;
        const end = start + match[0].length;
        if ((start > 0 && ADDRESS_PART.test(text[start - 1])) ||
            (end < text.length && ADDRESS_PART.test(text[end]))) continue;

        if (start > cursor) parts.push({ text: text.slice(cursor, start) });
        const label = match[0];
        parts.push({ text: label, href: label.startsWith("/") ? label.toLowerCase() : `mailto:${label.toLowerCase()}` });
        cursor = end;
    }

    if (cursor < text.length) parts.push({ text: text.slice(cursor) });
    return parts;
}
