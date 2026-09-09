import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  PANE_HEADER_PX,
  GRID_PADDING_PX,
  GRID_GAP_PX,
  PANE_BORDER_PX,
  SCROLLBAR_PX,
  TERM_INSET_X,
  TERM_INSET_Y,
} from "../src/lib/spawnGeometry.ts";
import { PANE_CHROME } from "../src/lib/paneChrome.ts";

// Cross-file contracts that no unit test can reach: the spawn-size prediction
// is arithmetic over a stylesheet and an xterm constant, and two launch bugs
// came down to a single call disappearing from a file. Each of these failed
// silently in the running app, so they are pinned here instead.

const read = (path) => readFile(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

test("spawn geometry still matches the pane stylesheet", async () => {
  const workspace = await read("src/styles/workspace.css");
  const panes = await read("src/styles/workspace.part-02.css");

  // The pane frame is now a set of custom properties the grid density picks
  // between, so what the stylesheet pins here is the fallback each one falls
  // back to — the comfortable frame, which is what these constants describe.
  const header = /\.pane__header\s*\{[^}]*?min-height:\s*var\(--pane-header-h,\s*(\d+)px\)/.exec(workspace);
  assert.ok(header, ".pane__header no longer declares a min-height");
  assert.equal(
    Number(header[1]),
    PANE_HEADER_PX,
    "PANE_HEADER_PX must track the .pane__header min-height fallback",
  );

  assert.equal(
    Number(/\.grid\s*\{[^}]*?padding:\s*var\(--grid-pad,\s*(\d+)px\)/.exec(workspace)?.[1]),
    GRID_PADDING_PX,
  );
  assert.equal(
    Number(/\.grid\s*\{[^}]*?gap:\s*var\(--grid-gap,\s*(\d+)px\)/.exec(workspace)?.[1]),
    GRID_GAP_PX,
  );
  assert.equal(Number(/\.pane\s*\{[^}]*?border:\s*(\d+)px/.exec(workspace)?.[1]) * 2, PANE_BORDER_PX);

  const padding = /\.term-view\s*\{[^}]*?padding:\s*var\(--term-pad,\s*([^)]+)\)/.exec(panes);
  assert.ok(padding, ".term-view no longer declares padding");
  const [top, right, bottom, left] = padding[1].trim().split(/\s+/).map((v) => parseInt(v, 10));
  assert.equal(left + right, TERM_INSET_X, "TERM_INSET_X must track .term-view side padding");
  assert.equal(top + bottom, TERM_INSET_Y, "TERM_INSET_Y must track .term-view vertical padding");
});

test("every grid density spends exactly the pixels the layout budgets it", async () => {
  // The layout predicts the xterm grid from PANE_CHROME, so a density whose
  // stylesheet drifts from it mispredicts every pane it lays out — silently,
  // as a pane that reflows once on spawn.
  const css = await read("src/styles/terminal-density.css");
  for (const [density, chrome] of Object.entries(PANE_CHROME)) {
    const block = new RegExp(`\\.grid--${density}\\s*\\{([^}]*)\\}`).exec(css);
    assert.ok(block, `terminal-density.css has no .grid--${density} block`);
    const value = (name) => {
      const found = new RegExp(`--${name}:\\s*([^;]+);`).exec(block[1]);
      assert.ok(found, `.grid--${density} does not set --${name}`);
      return found[1].trim();
    };
    const where = `.grid--${density}`;
    assert.equal(parseInt(value("grid-gap"), 10), chrome.gap, `${where} gap`);
    assert.equal(parseInt(value("grid-pad"), 10), chrome.padding, `${where} padding`);
    assert.equal(parseInt(value("pane-header-h"), 10), chrome.header, `${where} header`);
    const [top, right, bottom, left] = value("term-pad").split(/\s+/).map((v) => parseInt(v, 10));
    assert.equal(left + right, chrome.insetX, `${where} horizontal term padding`);
    assert.equal(top + bottom, chrome.insetY, `${where} vertical term padding`);
  }
});

test("scrollbar reserve still matches the xterm build in node_modules", async (t) => {
  let source;
  try {
    source = await read("node_modules/@xterm/xterm/src/browser/shared/Constants.ts");
  } catch {
    t.skip("xterm sources not published in this install");
    return;
  }
  const declared = /DEFAULT_SCROLL_BAR_WIDTH\s*=\s*(\d+)/.exec(source);
  assert.ok(declared, "xterm no longer declares DEFAULT_SCROLL_BAR_WIDTH");
  assert.equal(
    Number(declared[1]),
    SCROLLBAR_PX,
    "FitAddon reserves this width; an unmatched value re-widens every spawned PTY",
  );
});

test("mounting a terminal always hands the PTY the grid it built", async () => {
  const instance = await read("src/lib/terminalInstance.ts");
  // onResize cannot carry the first size — FitAddon skips term.resize() when
  // the pre-spawn estimate already matched — so this unconditional call is
  // the only thing keeping the PTY and the renderer the same size.
  assert.match(
    instance,
    /fitTerminal\(entry\);\s*\n\s*void resizeTerminal\(id, term\.rows, term\.cols\)/,
    "creating a terminal must sync the PTY immediately after its first fit",
  );
});

test("only an explicit count opens more than one terminal", async () => {
  const launch = await read("src/lib/configuredLaunch.ts");
  assert.doesNotMatch(
    launch,
    /\.terminalCount\b/,
    "terminalCount belongs to the Launch setup button that spells it out; " +
      "reading it here makes every picker and quick chip open N terminals per click",
  );
  assert.match(launch, /options\.count \?\? 1/, "launches must default to a single terminal");
});
