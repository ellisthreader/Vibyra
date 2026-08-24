import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  PANE_HEADER_PX,
  SCROLLBAR_PX,
  TERM_INSET_X,
  TERM_INSET_Y,
} from "../src/lib/spawnGeometry.ts";

// Cross-file contracts that no unit test can reach: the spawn-size prediction
// is arithmetic over a stylesheet and an xterm constant, and two launch bugs
// came down to a single call disappearing from a file. Each of these failed
// silently in the running app, so they are pinned here instead.

const read = (path) => readFile(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

test("spawn geometry still matches the pane stylesheet", async () => {
  const panes = await read("src/styles/workspace-pane.css");

  // `box-sizing: border-box` is global, so min-height already covers the
  // header's 1px bottom border — the header box is exactly this tall.
  const header = /\.pane__header\s*\{[^}]*?min-height:\s*(\d+)px/.exec(panes);
  assert.ok(header, ".pane__header no longer declares a min-height");
  assert.equal(
    Number(header[1]),
    PANE_HEADER_PX,
    "PANE_HEADER_PX must track .pane__header min-height",
  );

  const padding = /\.term-view\s*\{[^}]*?padding:\s*([^;]+);/.exec(panes);
  assert.ok(padding, ".term-view no longer declares padding");
  const [top, right, bottom, left] = padding[1].trim().split(/\s+/).map((v) => parseInt(v, 10));
  assert.equal(left + right, TERM_INSET_X, "TERM_INSET_X must track .term-view side padding");
  assert.equal(top + bottom, TERM_INSET_Y, "TERM_INSET_Y must track .term-view vertical padding");
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
  const registry = await read("src/lib/terminalRegistry.ts");
  // onResize cannot carry the first size — FitAddon skips term.resize() when
  // the pre-spawn estimate already matched — so this unconditional call is
  // the only thing keeping the PTY and the renderer the same size.
  assert.match(
    registry,
    /fitTerminal\(entry\);\s*\n\s*void resizeTerminal\(id, term\.rows, term\.cols\)/,
    "mountTerminal must sync the PTY immediately after its first fit",
  );
});

test("off-screen xterms detach while keeping their registry scrollback", async () => {
  const registry = await read("src/lib/terminalRegistry.ts");
  const view = await read("src/components/terminal/TerminalView.tsx");
  assert.match(registry, /export function unmountTerminal[\s\S]*detach\(id\)/);
  assert.match(view, /unmountTerminal\(id\)/);
});

test("status indicators never keep WebKit repainting terminal canvases", async () => {
  const styles = await Promise.all([
    read("src/styles/base-activity-dots.css"),
    read("src/styles/strip.css"),
    read("src/styles/home.css"),
  ]);
  assert.doesNotMatch(
    styles.join("\n"),
    /animation:\s*[^;]*infinite/,
    "infinite status pulses make WebKitGTK continuously composite every WebGL terminal",
  );
});

test("terminal IPC serialises each PTY input stream", async () => {
  const ipc = await read("src/ipc/terminal.ts");
  const registry = await read("src/lib/terminalRegistry.ts");
  assert.match(
    ipc,
    /export const writeTerminal = createTerminalInputQueue/,
    "independent invoke calls can overtake each other and render typed text one key behind",
  );
  const inputHandler = registry.match(/term\.onData\(\(data\) => \{([\s\S]*?)\n\s*\}\);/)?.[1] ?? "";
  assert.match(inputHandler, /sessionInputReceived\(id, data\)/);
  assert.match(inputHandler, /writeTerminal\(id, data\)/);
  assert.doesNotMatch(
    inputHandler,
    /anchorNow/,
    "typing must not synchronously scan and re-anchor rows before PTY output exists",
  );
});

test("terminal mount waits for font and renderer readiness", async () => {
  const view = await read("src/components/terminal/TerminalView.tsx");
  const suspended = await read("src/components/terminal/SuspendedPaneView.tsx");
  const registry = await read("src/lib/terminalRegistry.ts");
  const renderer = await read("src/lib/xtermRenderer.ts");
  assert.match(
    view,
    /initTerminalFont\(\)\.then\(\(\) => \{[\s\S]*mountTerminal\(/,
    "xterm must not measure cells before the bundled font is ready",
  );
  assert.match(
    suspended,
    /initTerminalFont\(\)\.then\(\(\) => \{[\s\S]*new Terminal\(/,
    "restored snapshot xterms must wait for the same bundled font",
  );
  assert.match(suspended, /cancelled = true;[\s\S]*term\?\.dispose\(\)/);
  assert.match(registry, /scrollOnUserInput:\s*true/);
  assert.match(
    renderer,
    /const webgl = await loadWebgl\(term\)/,
    "an early terminal must wait for the asynchronous WebGL import",
  );
  assert.match(renderer, /contextLost\.has\(term\)/, "a lost WebGL context stays on DOM");
  assert.match(renderer, /term\.element\?\.parentNode/);
  const existingBranch = registry.match(/if \(existing\) \{([\s\S]*?)return existing;/)?.[1] ?? "";
  assert.doesNotMatch(existingBranch, /attachTerminalRenderer/);
});

test("the native app rejects a second session owner before other plugins start", async () => {
  const source = await read("src-tauri/src/lib.rs");
  const single = source.indexOf(".plugin(tauri_plugin_single_instance::init");
  const dialog = source.indexOf(".plugin(tauri_plugin_dialog::init");
  assert.ok(single >= 0 && single < dialog, "single-instance must be the first plugin");
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
