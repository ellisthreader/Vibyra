import { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { MarkdownBlocks } from '../src/components/markdown/MarkdownBlocks';
import { parseMarkdownDocument } from '../src/lib/markdownDocument.ts';
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import '../src/styles/controls.css';
import '../src/components/markdown/markdown.css';

if (location.search.includes('light')) document.documentElement.dataset.theme = 'light';
document.body.style.overflow = 'auto';

const HEAD = `# Workspace answer

Here is what I found, and this paragraph keeps the soft break
the model wrote onto a second line.

## Checks worth running

- Run the desktop gates
  - Lines first, then knip
- [ ] Wire the panel up
- [x] Land the renderer

1. First
2. Second

> A quote is context, not AI activity.

| Command | What it does | Notes |
| --- | :---: | ---: |`;
const ROWS = [
  '| npm test | Runs the node suite | fast |',
  '| npm run verify | Lines, knip, tests, tsc and vite, and then every Rust gate in order | slow |',
  '| cargo test | Workspace crates | ok |',
];
const TAIL = `
\`\`\`bash
npm run verify
\`\`\`

\`\`\`python
print("no Run button here")
\`\`\`

---

Read [the site](https://vibyra.app), never [the trap](javascript:alert(1)).
Inline \`code\`, **bold**, *italic*, MAX_CHARS_PER_MESSAGE and ~~struck~~.
`;

const STREAM = `## Streaming reply

Vibyra is **rendering** this as it arrives, with \`inline code\`, *italics*, _underlines_ and ~~a struck phrase~~ kept whole.

- one item
- another \`npm test\` item

| Command | Effect |
| --- | --- |
| npm test | green |

\`\`\`bash
npm run verify
\`\`\`

Check \`npm test\` and ~~never~~ the bare suite:

~~~bash
npm test --filter markdown
~~~

Done.
`;

/* Every prefix, one character at a time — the ladder walks straight through
   bold, italic, underline, strikethrough and inline code. The single skip is a
   table header row that has no delimiter row yet: that one stays prose on
   purpose, because stopping a column from appearing and then moving is worth a
   frame of literal pipes. */
const LADDER = (() => {
  const head = STREAM.indexOf('| Command');
  const safe = STREAM.indexOf('\n', STREAM.indexOf('\n', head) + 1) + 1;
  const cuts = [];
  for (let at = 1; at <= STREAM.length; at++) if (at <= head || at >= safe) cuts.push(at);
  return cuts;
})();

let rerender = () => {};
const state = { rows: 1, step: 0, width: 0, mode: 'streaming' };
const runs: string[] = [];
/* Synchronous commits: the ladder is walked in one pass inside the page, and a
   batched render would have each step reading the previous prefix's DOM. */
const commit = () => flushSync(rerender);
Object.assign(window, {
  steps: () => LADDER.length,
  mode: () => state.mode,
  /* The exact source prefix on screen, so a failure reports the input rather
     than a step number that would have to be counted back out of the ladder. */
  prefix: () => STREAM.slice(0, LADDER[state.step]),
  seek: (index: number) => { state.step = Math.max(0, Math.min(index, LADDER.length - 1)); commit(); return state.step; },
  step: () => { state.step = Math.min(state.step + 1, LADDER.length - 1); commit(); return LADDER.length - 1 - state.step; },
  streamRow: () => { state.rows = Math.min(state.rows + 1, ROWS.length); commit(); return state.rows; },
  setWidth: (px: number) => { state.width = px; commit(); },
  runs: () => runs,
});

function Fixture() {
  const [, tick] = useState(0);
  useEffect(() => { rerender = () => tick(n => n + 1); }, []);
  const doc = useMemo(() => parseMarkdownDocument(`${HEAD}\n${ROWS.slice(0, state.rows).join('\n')}\n${TAIL}`), [state.rows]);
  const at = LADDER[state.step];
  // Streamed while it is arriving, then parsed once more plainly when it lands:
  // a reply that ended mid-run would otherwise keep its tail hidden for good and
  // read as truncated output rather than as a live one.
  const live = useMemo(() => {
    state.mode = at < STREAM.length ? 'streaming' : 'settled';
    return parseMarkdownDocument(STREAM.slice(0, at), state.mode === 'streaming' ? { streaming: true } : undefined);
  }, [at]);
  const width = state.width ? `${state.width}px` : '100%';
  // Block flow, not grid: a grid track sizes to its item's max-content and would
  // let a wide table push the page sideways instead of scrolling inside itself.
  return <main style={{ padding: 12 }}>
    {/* Two surfaces, two type sizes, one sheet: every length in markdown.css is em. */}
    <section id="doc" style={{ width, maxWidth: '100%', fontSize: 13, marginBottom: 28 }}>
      <MarkdownBlocks doc={doc} onRun={command => { runs.push(command); rerender(); }} />
    </section>
    <section id="stream" style={{ width, maxWidth: '100%', fontSize: 15 }}>
      <MarkdownBlocks doc={live} />
    </section>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
