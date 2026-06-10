import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(
  new URL("./app.terminals-companion-voice-history.js", import.meta.url),
  "utf8"
);

function voiceHistoryContext() {
  const context = vm.createContext({
    escapeHtml: (value) => String(value),
    terminalCompanionActiveTerminal: () => null
  });
  vm.runInContext(source, context);
  return context;
}

test("voice replies stay with their user turn when its thread transfers terminals", () => {
  const context = voiceHistoryContext();

  const result = vm.runInContext(`(() => {
    const user = appendTerminalVoiceMessage(null, "user", "Open my project.");
    transferTerminalVoiceThread("setup", "terminal-1");
    appendTerminalVoiceReply(user, "I opened your project.", null);
    return {
      setup: terminalVoiceThreadById("setup"),
      target: terminalVoiceThreadById("terminal-1"),
      html: terminalVoiceConversationHtml({ id: "terminal-1" })
    };
  })()`, context);

  assert.equal(result.setup.length, 0);
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.target)),
    [
      { role: "user", text: "Open my project." },
      { role: "assistant", text: "I opened your project." }
    ]
  );
  assert.match(result.html, />You</);
  assert.match(result.html, />Vibyra</);
  assert.match(result.html, /I opened your project\./);
});
