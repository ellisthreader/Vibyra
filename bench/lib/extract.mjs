// Answer extraction. Prompts ask for a final line "ANSWER: X"; we take the
// last such line, and fall back only to strict forms, never to guessing.
export function finalAnswer(text) {
    const lines = [...text.matchAll(/ANSWER\s*[:：]\s*(.+)/gi)];
    return lines.length ? lines.at(-1)[1].trim().replace(/[*`$]/g, "").trim() : null;
}

export function choice(text, letters = "ABCDEFGHIJ") {
    const raw = finalAnswer(text);
    const m = raw?.match(new RegExp(`^\\(?([${letters}])\\)?(?:[.)\\s]|$)`, "i"));
    return m ? m[1].toUpperCase() : null;
}

export function integer(text) {
    const raw = finalAnswer(text);
    const m = raw?.replace(/,/g, "").match(/^-?\d+/);
    return m ? Number(m[0]) : null;
}

// The last fenced code block, which is where every coding prompt asks for the solution.
export function codeBlock(text, lang = "python") {
    const blocks = [...text.matchAll(/```([\w+-]*)\n([\s\S]*?)```/g)];
    const preferred = blocks.filter((b) => !b[1] || b[1].toLowerCase() === lang);
    return (preferred.at(-1) ?? blocks.at(-1))?.[2] ?? null;
}
