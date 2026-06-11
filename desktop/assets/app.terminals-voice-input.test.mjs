import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./app.terminals-voice-input.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("./app.terminals-voice-input.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../app.html", import.meta.url), "utf8");

test("terminal voice input uses a distinct global shortcut and captures the selected terminal", () => {
  assert.match(source, /event\.code !== "F8"/);
  assert.doesNotMatch(source, /event\.altKey/);
  assert.doesNotMatch(source, /event\.shiftKey/);
  assert.match(source, /terminalVoiceInputState\.targetId = terminal\.id/);
  assert.match(source, /desktopPromptTranscriptMetadata\("terminal-dictation"/);
  assert.match(source, /desktopPromptTranscriptTarget\(terminalVoiceInputState\.targetId\)/);
  assert.match(source, /deliverTerminalVoiceInput\([\s\S]*result\.transcript/);
  assert.match(source, /transcriptSource: "terminal-dictation"/);
  assert.match(source, /transcriptTurn/);
  assert.match(source, /terminalVoiceInputState\.phase === "starting"[\s\S]*cancelTerminalVoiceInput\(\)/);
  assert.match(source, /60_000/);
});

test("terminal voice input delivers to its captured target even if selection changes", () => {
  const delivered = [];
  const context = vm.createContext({
    activePage: "terminals",
    activeTerminalId: "terminal-2",
    document: {
      body: { dataset: {}, append() {} },
      addEventListener() {},
      querySelector() { return null; }
    },
    escapeHtml: (value) => String(value),
    findTerminal(id) {
      return id === "terminal-1" ? { id, title: "Taylor" } : null;
    },
    navigator: {},
    setTimeout,
    clearTimeout,
    terminalCompanionInsertIntoTerminal(id, text, submit, options) {
      delivered.push({ id, text, submit, options });
      return true;
    },
    window: { addEventListener() {} }
  });
  vm.runInContext(source, context);
  const terminal = vm.runInContext(`deliverTerminalVoiceInput("Review this change.", "terminal-1")`, context);

  assert.equal(terminal.id, "terminal-1");
  assert.deepEqual(JSON.parse(JSON.stringify(delivered)), [{
    id: "terminal-1",
    text: "Review this change.",
    submit: true,
    options: {
      logPrompt: false,
      transcriptSource: "terminal-dictation",
      transcriptTurn: null
    }
  }]);
});

test("terminal voice input has a transient accessible listening overlay", () => {
  assert.match(styles, /\.terminal-voice-input\s*\{/);
  assert.match(styles, /\[data-phase="listening"\]/);
  assert.match(styles, /#ff6677/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(source, /aria-live/);
  assert.match(source, /F8 to send/);
  assert.match(app, /app\.terminals-voice-input\.css/);
  assert.ok(
    app.indexOf("app.prompt-transcript.js")
      < app.indexOf("app.terminals-voice-input.js")
  );
  assert.match(app, /app\.terminals-voice-input\.js/);
});
