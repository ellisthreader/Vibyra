import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const legacySource = readFileSync(
  new URL("./app.terminals-pty.js", import.meta.url),
  "utf8",
);
const runtimeSource = readFileSync(
  new URL("./app.terminals-pty-runtime.js", import.meta.url),
  "utf8",
);
const pathDropSource = readFileSync(
  new URL("./app.terminals-path-drop.js", import.meta.url),
  "utf8",
);
const promptLogSource = readFileSync(
  new URL("./app.terminals-pty-prompt-log.js", import.meta.url),
  "utf8",
);
const appSource = readFileSync(new URL("../app.html", import.meta.url), "utf8");

test("PTY keyboard input has one browser event owner", () => {
  assert.match(legacySource, /bindPtyInput\(node\)/);
  assert.doesNotMatch(legacySource, /addEventListener\("keydown"/);
  assert.doesNotMatch(legacySource, /addEventListener\("paste"/);

  assert.equal(
    [...runtimeSource.matchAll(/addEventListener\("keydown"/g)].length,
    1,
  );
  assert.equal(
    [...runtimeSource.matchAll(/addEventListener\("paste"/g)].length,
    1,
  );
  assert.equal([...runtimeSource.matchAll(/xterm\.onData\(/g)].length, 1);
  assert.match(runtimeSource, /if \(window\.Terminal\) return;/);
  assert.match(runtimeSource, /screenReaderMode: false/);
  assert.doesNotMatch(runtimeSource, /screenReaderMode: true/);
  assert.match(runtimeSource, /terminalXterms\[id\] !== xterm \|\| !xterm\.element\?\.isConnected/);
  assert.match(runtimeSource, /terminalPtyCompletedPrompts\(id, input\)/);
  assert.match(runtimeSource, /queueTerminalPtyInput\(id, prompts/);
  assert.match(runtimeSource, /sendPtyInputNow[\s\S]*markTerminalProviderBusy\(terminal\)/);
  assert.match(promptLogSource, /persistDesktopPromptTranscript\(prompt, "terminal-pty"/);
  assert.ok(
    appSource.indexOf("app.terminals-pty-prompt-log.js")
      < appSource.indexOf("app.terminals-pty-runtime.js")
  );
});

test("screenshot path drop inserts once through xterm paste", () => {
  const listeners = {};
  const node = {
    classList: { add() {}, remove() {} },
    contains: () => false,
    dataset: { terminalInput: "terminal-1" },
    addEventListener: (type, listener) => { listeners[type] = listener; }
  };
  const calls = [];
  const context = {
    focusPtyTerminal: (id) => calls.push(["focus", id]),
    terminalCompanionInsertIntoTerminal: (...args) => calls.push(["fallback", ...args]),
    terminalXterms: {
      "terminal-1": {
        element: { isConnected: true },
        paste: (value) => calls.push(["paste", value])
      }
    }
  };
  vm.runInNewContext(`${pathDropSource}
this.bind = bindTerminalPathDrop;`, context);
  context.bind(node);
  const dataTransfer = {
    dropEffect: "none",
    getData: () => '"/tmp/screen.png"',
    types: ["application/x-vibyra-screenshot-path"]
  };
  let prevented = 0;

  listeners.dragover({ dataTransfer, preventDefault: () => { prevented += 1; } });
  listeners.drop({ dataTransfer, preventDefault: () => { prevented += 1; } });

  assert.equal(dataTransfer.dropEffect, "copy");
  assert.equal(prevented, 2);
  assert.deepEqual(calls, [
    ["focus", "terminal-1"],
    ["paste", '"/tmp/screen.png"']
  ]);
  assert.match(runtimeSource, /bindTerminalPathDrop\(node\)/);
});

test("focusing a PTY updates the selected terminal styling", () => {
  const start = runtimeSource.indexOf("function focusPtyTerminal");
  const end = runtimeSource.indexOf("\nfunction fitPtyXterm", start);
  const focusSource = runtimeSource.slice(start, end);

  assert.match(focusSource, /activeTerminalId = id/);
  assert.match(focusSource, /refreshPtyTerminalsDom\(\)/);
  assert.ok(
    focusSource.indexOf("activeTerminalId = id") < focusSource.indexOf("refreshPtyTerminalsDom()"),
  );
});

test("Auto deciding keeps the viewport at the top and disables bottom anchoring", () => {
  const positionStart = runtimeSource.indexOf("function terminalAutoDeciding");
  const positionEnd = runtimeSource.indexOf("\nfunction focusPtyTerminal", positionStart);
  const positionContext = {
    overscanCalls: 0,
    applyPtyBottomOverscan: () => { positionContext.overscanCalls += 1; }
  };
  vm.runInNewContext(
    `${runtimeSource.slice(positionStart, positionEnd)}
this.position = positionPtyViewport;`,
    positionContext
  );

  const decidingScrolls = [];
  positionContext.position(
    { autoDeciding: true },
    {
      scrollToTop: () => decidingScrolls.push("top"),
      scrollToBottom: () => decidingScrolls.push("bottom")
    }
  );
  assert.deepEqual(decidingScrolls, ["top"]);

  const normalScrolls = [];
  positionContext.position(
    { autoDeciding: false },
    {
      scrollToTop: () => normalScrolls.push("top"),
      scrollToBottom: () => normalScrolls.push("bottom")
    }
  );
  assert.deepEqual(normalScrolls, ["bottom"]);
  assert.equal(positionContext.overscanCalls, 2);

  const overscanStart = runtimeSource.indexOf("function applyPtyBottomOverscan");
  const overscanEnd = runtimeSource.indexOf("\nfunction terminalPtyBottomRowsContainContent", overscanStart);
  const overscanContext = {
    terminalAutoDeciding: (terminal) => Boolean(terminal?.autoDeciding)
  };
  vm.runInNewContext(
    `${runtimeSource.slice(overscanStart, overscanEnd)}
this.apply = applyPtyBottomOverscan;`,
    overscanContext
  );
  const element = {
    style: {
      height: "calc(100% + 20px)",
      transform: "translateY(-20px)"
    }
  };
  overscanContext.apply({ autoDeciding: true }, { element });
  assert.equal(element.style.height, "");
  assert.equal(element.style.transform, "");

  assert.match(runtimeSource, /appendPtyOutput[\s\S]*positionPtyViewport\(terminal,\s*xterm\)/);
  assert.match(runtimeSource, /writePtySnapshot[\s\S]*positionPtyViewport\(findTerminal\(id\),\s*xterm\)/);
  assert.match(runtimeSource, /focusPtyTerminal[\s\S]*positionPtyViewport\(terminal,\s*xterm\)/);
});

test("assigned terminal tasks are transient and submitted after PTY creation", () => {
  assert.match(legacySource, /\{\s*initialPrompt,\s*initialAssignmentId,\s*pending,/);
  assert.match(legacySource, /const initialPrompt = normalizeInitialTerminalPrompt\(options\.initialPrompt\)/);
  assert.match(legacySource, /initialPrompt,\s*updatedAt/);
  assert.match(runtimeSource, /Object\.assign\(terminal,\s*ptySessionPatch\(result\.session\)/);
  assert.match(runtimeSource, /await submitInitialPtyPrompt\(terminal\)/);
  assert.match(runtimeSource, /\/desktop\/pty-terminals\/\$\{encodeURIComponent\(terminal\.id\)\}\/assign/);
  assert.match(runtimeSource, /JSON\.stringify\(\{\s*assignmentId,\s*prompt\s*\}\)/);
  assert.match(runtimeSource, /if \(!response\.ok\) throw new Error/);
  assert.match(runtimeSource, /finally\s*\{[\s\S]*delete terminal\.initialPrompt/);
  assert.doesNotMatch(runtimeSource, /sendPtyInput\(terminal\.id,\s*"\\r"\)/);
  assert.match(runtimeSource, /terminal\.ptyStartQueued[\s\S]*terminal\.ptyStatus === "starting"/);
});

test("authoritative PTY transcripts are not duplicated into localStorage", () => {
  assert.match(legacySource, /\{\s*initialPrompt,\s*initialAssignmentId,\s*pending,\s*notice,\s*output,/);
  assert.doesNotMatch(legacySource, /output:\s*String\(terminal\.output/);
});

test("PTY collection sync is serialized and reconciliation preserves local task state", () => {
  assert.match(runtimeSource, /if \(ptyCollectionSyncPromise\) return ptyCollectionSyncPromise/);
  assert.match(runtimeSource, /ptyCollectionSyncPromise = performPtyTerminalSync\(\)/);
  assert.match(runtimeSource, /const localNotice = terminal\.notice/);
  assert.match(runtimeSource, /terminal\.notice = localNotice \|\| terminal\.workspaceNotice \|\| null/);
  assert.match(runtimeSource, /providerState:\s*provider\.state/);
  assert.match(runtimeSource, /providerReady:\s*provider\.ready/);
  assert.match(runtimeSource, /providerBusy:\s*provider\.busy/);
});

test("PTY output reaches xterm unchanged for live writes and transcript replay", () => {
  assert.match(runtimeSource, /xterm\.write\(terminalDisplayOutput\(terminal,\s*data\),/);
  assert.match(runtimeSource, /terminalDisplayOutput\(findTerminal\(id\),\s*output\)/);
  assert.match(runtimeSource, /applyPtyBottomOverscan\(terminal,\s*xterm\)/);

  const start = runtimeSource.indexOf("function terminalDisplayOutput");
  const end = runtimeSource.indexOf("\nfunction focusPtyTerminal", start);
  const context = {};
  vm.runInNewContext(`${runtimeSource.slice(start, end)}\nthis.render = terminalDisplayOutput;`, context);

  const codexTui = "\x1b]0;⠋ Working\x07\x1b[?25l\x1b[38;5;141m›\x1b[0m edit app.js\r\n\x1b[2K\x1b[1A";
  const legacyBanner = "\\\\          //\r\nVIBYRA AUTO\r\n❯ auto \x1b[undefinedm";
  const otherAgentOutput = "\x1b[32m❯ ready\x1b[0m";

  assert.equal(context.render({ agent: "vibyra", model: "auto" }, codexTui), codexTui);
  assert.equal(context.render({ agent: "vibyra", model: "auto" }, legacyBanner), legacyBanner);
  assert.equal(context.render({ agent: "codex", model: "auto" }, codexTui), codexTui);
  assert.equal(context.render({ agent: "claude", model: "claude" }, otherAgentOutput), otherAgentOutput);
  assert.equal(context.render({ agent: "gemini", model: "gemini" }, otherAgentOutput), otherAgentOutput);
});

test("terminal workspace mode is persisted and sent to the authoritative PTY service", () => {
  assert.match(legacySource, /workspaceMode:\s*normalizeTerminalWorkspaceMode\(options\.workspaceMode\)/);
  assert.match(legacySource, /terminalWorkspaceSetupPicker\(\)/);
  assert.match(runtimeSource, /workspaceMode:\s*terminal\.workspaceMode/);
  assert.match(runtimeSource, /allowSharedFallback:\s*terminal\.workspaceMode === "worktree"/);
  assert.match(runtimeSource, /workspaceMode:\s*normalizeTerminalWorkspaceMode\(session\.workspaceMode\)/);
  assert.match(runtimeSource, /branchName:\s*String\(session\.branchName/);
  assert.match(runtimeSource, /workspaceNotice:\s*String\(session\.workspaceNotice/);
  assert.match(runtimeSource, /refreshTerminalWorkspaceIndicator\(article,\s*terminal\)/);
  assert.match(runtimeSource, /insertAdjacentHTML\("afterend",\s*terminalNotice\(terminal\)\)/);
});

test("terminal launch mounts xterm after synchronous render without waiting for animation frames", () => {
  const source = readFileSync(new URL("./app.terminals-pty-runtime.js", import.meta.url), "utf8");
  const queueStart = source.slice(
    source.indexOf("function queueStartPtyTerminal"),
    source.indexOf("function connectPtyTerminal")
  );
  let starts = 0;
  let mounts = 0;
  const frames = [];
  const microtasks = [];
  const context = {
    findTerminal: () => true,
    mountVisibleXterms: () => { mounts += 1; },
    startPtyTerminal: () => { starts += 1; },
    queueMicrotask: (callback) => microtasks.push(callback),
    Promise,
    window: { requestAnimationFrame: (callback) => frames.push(callback) },
    console
  };
  vm.runInNewContext(`${queueStart}\nthis.queueStart = queueStartPtyTerminal;`, context);

  context.queueStart({ id: "terminal-1" });
  assert.equal(starts, 0);
  assert.equal(mounts, 0);
  assert.equal(microtasks.length, 1);
  assert.equal(frames.length, 1);
  microtasks.shift()();
  assert.equal(starts, 1);
  assert.equal(mounts, 1);
  frames.shift()();
  frames.shift()();
  assert.equal(starts, 1);
  assert.equal(mounts, 2);
  assert.match(queueStart, /try\s*\{\s*mountVisibleXterms\(\)/);
  assert.match(queueStart, /void startPtyTerminal\(terminal\)/);
  assert.match(source, /signal:\s*controller\.signal/);
  assert.match(source, /Terminal startup timed out/);
});

test("initial PTY sizing uses the mounted xterm cell metrics", () => {
  assert.match(runtimeSource, /initialPtyStartSize[\s\S]*measuredPtySize\(node,\s*terminalXterms\[id\]\)/);
  assert.match(runtimeSource, /if \(document\.visibilityState === "hidden"\) return/);
  assert.match(runtimeSource, /visibilitychange[\s\S]*schedulePtyXtermFit\(terminal\.id,\s*\{ forceBackend: true \}\)/);
});

test("layout-driven PTY resizing waits for stable pane geometry", () => {
  const companionSource = readFileSync(
    new URL("./app.terminals-companion.js", import.meta.url),
    "utf8",
  );
  const observerStart = runtimeSource.indexOf("function ensureTerminalXtermResizeObserver");
  const observerEnd = runtimeSource.indexOf("\nfunction observeTerminalXtermNode", observerStart);
  const observerSource = runtimeSource.slice(observerStart, observerEnd);
  const companionFitStart = companionSource.indexOf("function scheduleTerminalCompanionFit");
  const companionFitSource = companionSource.slice(companionFitStart);

  assert.match(runtimeSource, /const terminalXtermLayoutSettleDelay = 120/);
  assert.match(runtimeSource, /function scheduleSettledPtyXtermFit/);
  assert.match(runtimeSource, /pending\.forceBackend = pending\.forceBackend \|\| Boolean\(options\.forceBackend\)/);
  assert.match(observerSource, /scheduleSettledPtyXtermFit\(id\)/);
  assert.doesNotMatch(observerSource, /fitPtyXterm\(id,\s*node\)/);
  assert.match(companionFitSource, /scheduleSettledPtyXtermFit\(id,\s*\{ forceBackend: true \}\)/);
  assert.doesNotMatch(companionFitSource, /mountVisibleXterms\(\)/);
  assert.match(runtimeSource, /removeLocalPtyTerminal[\s\S]*cancelSettledPtyXtermFit\(id\)/);
});

test("Codex keeps its native bottom margin in a scrollable xterm overscan buffer", () => {
  const start = runtimeSource.indexOf("function backendPtySize");
  const end = runtimeSource.indexOf("\nfunction sendPtyResize", start);
  const context = {
    terminalAutoDeciding: () => false
  };
  vm.runInNewContext(`${runtimeSource.slice(start, end)}
    this.backend = backendPtySize;
    this.rendererRows = rendererPtyRows;
    this.geometryInset = terminalPtyBottomInsetForGeometry;
    this.applyBottomFit = applyPtyBottomOverscan;
    this.bottomInset = terminalPtyBottomInsetPixels;
    this.bottomAnchorRows = terminalPtyBottomAnchorRows;
    this.bottomRowsContainContent = terminalPtyBottomRowsContainContent;`, context);

  const codex = { agent: "codex", model: "gpt-5.4-mini" };
  const managedCodex = {
    agent: "vibyra",
    model: "gpt-5.4-mini",
    launchPlan: { runtimeId: "codex" }
  };
  const claude = {
    id: "claude-1",
    agent: "claude",
    model: "claude-haiku-4-5",
    launchPlan: { runtimeId: "claude" }
  };

  assert.deepEqual(
    JSON.parse(JSON.stringify(context.backend(codex, { cols: 101, rows: 26 }))),
    { cols: 101, rows: 28 },
  );
  assert.equal(context.rendererRows(managedCodex, 28), 26);
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.backend(claude, { cols: 101, rows: 26 }))),
    { cols: 101, rows: 26 },
  );
  assert.equal(context.bottomInset(claude, { bottomInset: 7 }), 7);
  assert.equal(context.bottomInset(codex, { bottomInset: 0 }), 0);
  assert.equal(context.geometryInset(454, 17, 27), 8);
  assert.equal(context.geometryInset(459, 17, 27), 3);
  assert.equal(context.geometryInset(450, 17, 26), 3);
  const claudeXterm = { element: { style: {} } };
  context.applyBottomFit(claude, claudeXterm, { bottomInset: 7 });
  assert.equal(claudeXterm.element.style.height, "calc(100% + 7px)");
  assert.equal(claudeXterm.element.style.transform, "translateY(-7px)");
  assert.match(runtimeSource, /xterm\.rows === backendSize\.rows/);
  assert.match(runtimeSource, /xterm\.resize\(backendSize\.cols,\s*backendSize\.rows\)/);
  assert.match(runtimeSource, /element\.style\.height = totalHeight \? `calc\(100% \+ \$\{totalHeight\}px\)` : ""/);
  assert.match(runtimeSource, /terminalPtyBottomRowsContainContent\(xterm,\s*rows\)/);
  assert.match(runtimeSource, /terminalPtyBottomAnchorRows\(terminal,\s*xterm\) \* cellHeight/);
  assert.match(runtimeSource, /element\.style\.transform = offset \? `translateY\(\$\{-offset\}px\)` : ""/);
  const xterm = {
    rows: 4,
    buffer: {
      active: {
        viewportY: 0,
        getLine(row) {
          return { translateToString: () => row === 3 ? "status" : "" };
        }
      }
    }
  };
  assert.equal(context.bottomRowsContainContent(xterm, 2), true);
  assert.equal(context.bottomAnchorRows(codex, xterm), 0);
  xterm.buffer.active.getLine = () => ({ translateToString: () => "" });
  assert.equal(context.bottomRowsContainContent(xterm, 2), false);
  xterm.rows = 10;
  xterm.buffer.active.getLine = (row) => ({
    translateToString: () => row === 4 ? "gpt-5.4-mini high" : ""
  });
  assert.equal(context.bottomAnchorRows(codex, xterm), 3);
  assert.equal(context.bottomAnchorRows(claude, xterm), 0);
  assert.match(runtimeSource, /Math\.min\(viewport\?\.clientHeight \|\| visibleHeight,\s*visibleHeight\)/);
  assert.match(runtimeSource, /fractionalOverflow = \(rows \* cellHeight\) - availableHeight/);
});
