import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shellSource = readFileSync(new URL("./app.shell.js", import.meta.url), "utf8");
const companionSource = readFileSync(new URL("./app.terminals-companion.js", import.meta.url), "utf8");
const companionStyles = readFileSync(new URL("./app.terminals-companion.css", import.meta.url), "utf8");
const companionChatSource = readFileSync(new URL("./app.terminals-companion-chat.js", import.meta.url), "utf8");
const companionChatStyles = readFileSync(new URL("./app.terminals-companion-chat.css", import.meta.url), "utf8");
const companionVoiceStyles = readFileSync(new URL("./app.terminals-companion-voice.css", import.meta.url), "utf8");
const companionVoiceConversationStyles = readFileSync(new URL("./app.terminals-companion-voice-conversation.css", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../app.html", import.meta.url), "utf8");
const companionVoiceFiles = [
  "app.terminals-companion-voice.js",
  "app.terminals-companion-voice-utils.js",
  "app.terminals-companion-voice-history.js",
  "app.terminals-companion-voice-request.js",
  "app.terminals-companion-voice-playback.js",
  "app.terminals-companion-voice-recorder.js",
  "app.terminals-companion-voice-transcription.js"
];
const companionVoiceSource = companionVoiceFiles
  .map((file) => readFileSync(new URL(`./${file}`, import.meta.url), "utf8"))
  .join("\n");
const ptyRuntimeSource = readFileSync(new URL("./app.terminals-pty-runtime.js", import.meta.url), "utf8");
const chatSendSource = readFileSync(new URL("./app.chat-send.js", import.meta.url), "utf8");
const projectPickerSource = readFileSync(new URL("./app.terminals-project-picker.js", import.meta.url), "utf8");
const terminalControlsSource = readFileSync(new URL("./app.terminals-controls.js", import.meta.url), "utf8");
const terminalPtySource = readFileSync(new URL("./app.terminals-pty.js", import.meta.url), "utf8");

test("terminal companion temporarily owns the collapsed rail", () => {
  assert.match(shellSource, /terminal-companion-active/);
  assert.match(shellSource, /options\.persist !== false/);
  assert.match(companionSource, /syncTerminalCompanionRail\(true, wasOpen\)/);
  assert.match(companionSource, /setRailCollapsed\(true, \{ persist: false, force: true \}\)/);
  assert.match(companionSource, /setRailCollapsed\(restoreCollapsed, \{ persist: false, force: true \}\)/);
  assert.match(companionStyles, /transition: grid-template-columns 180ms/);
  assert.match(companionStyles, /animation: terminal-companion-enter 180ms/);
  assert.match(companionStyles, /prefers-reduced-motion: reduce/);
});

test("terminal chat companion keeps its compact draft composer", () => {
  assert.doesNotMatch(companionSource, /terminal-companion-shell-actions/);
  assert.match(companionChatSource, /draft: ""/);
  assert.match(companionChatSource, /data-terminal-ai-prompt/);
  assert.match(companionChatSource, /data-terminal-companion-open="voice"/);
  assert.match(companionChatSource, /thread\.draft = input\.value/);
  assert.match(companionChatStyles, /grid-template-rows: minmax\(0, 1fr\) auto/);
  assert.match(companionChatStyles, /terminal-ai-chat-composer-foot/);
  assert.match(companionChatStyles, /grid-template-columns: minmax\(0, 1fr\) 330px/);
  assert.match(companionSource, /terminal-companion-stack/);
  assert.match(companionChatStyles, /grid-template-rows: minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.match(companionChatStyles, /\.terminal-companion-stack \{[\s\S]*height: 100%/);
});

test("terminal AI and Memory keep an equal companion split", () => {
  const memoryStyles = readFileSync(new URL("./app.terminals-memory.css", import.meta.url), "utf8");
  const graphStyles = readFileSync(new URL("./app.terminals-memory-graph.css", import.meta.url), "utf8");
  assert.match(memoryStyles, /\.terminal-companion:has\(\.terminal-memory-section--stacked\) \{\s*grid-template-rows: auto minmax\(0, 1fr\)/);
  assert.match(memoryStyles, /\.terminal-memory-section--stacked \{[\s\S]*max-height: 100%/);
  assert.match(graphStyles, /\.terminal-memory-section--stacked \.terminal-memory-graph svg \{[\s\S]*min-height: 0/);
});

test("terminal navigation exposes one Vibyra AI launcher without voice or memory tabs", () => {
  assert.match(companionSource, /function terminalCompanionToolbarHtml\(\) \{\s+return "";/);
  assert.match(companionSource, /function terminalCompanionStandaloneToolbarHtml\(\) \{\s+return "";/);
  assert.match(companionSource, /terminal-ai-topbar-button[\s\S]*\/app-assets\/vibyra\.png/);
  assert.doesNotMatch(companionSource, /terminal-ai-topbar-button[\s\S]*<span>Vibyra AI<\/span>/);
  assert.match(companionChatStyles, /\.terminal-ai-topbar-button\s*\{[\s\S]*width: 32px/);
  assert.doesNotMatch(companionSource, /data-terminal-companion-open="memory"/);
  assert.match(companionSource, /terminal-memory-section--stacked/);
});

test("terminal voice is a one-control AI conversation", () => {
  assert.match(companionVoiceSource, /Alt\+V/);
  assert.match(companionVoiceSource, /Back to chat/);
  assert.match(companionVoiceSource, /toggleTerminalVoice/);
  assert.match(companionVoiceSource, /requestDesktopChat\(\{/);
  assert.match(companionVoiceSource, /terminalVoiceThreads/);
  assert.match(companionVoiceSource, /terminalVoiceHistoryItems = 8/);
  assert.match(companionVoiceSource, /profileContext: terminalVoiceProfileContext\(\)/);
  assert.match(companionVoiceSource, /await runDesktopActions\(result\.actions, \{ desktopActionContextScope: actionContextScope \}\)/);
  assert.match(companionVoiceSource, /fetch\("\/desktop\/voice\/speak"/);
  assert.match(companionVoiceSource, /SpeechSynthesisUtterance/);
  assert.match(companionVoiceSource, /OpenAI voice unavailable; using system voice/);
  assert.match(companionVoiceSource, /AI-generated voice/);
  assert.match(companionVoiceSource, /\[terminalVoiceStyleInstruction, profile\?\.responseStyle\]/);
  assert.match(companionVoiceSource, /terminal\?\.id \|\| "setup"/);
  assert.match(companionVoiceSource, /terminalVoiceState\.actionInFlight = true/);
  assert.match(companionVoiceSource, /if \(terminalVoiceState\.actionInFlight\)/);
  assert.doesNotMatch(companionVoiceSource, /if \(!target\) return/);
  assert.match(appSource, /app\.terminals-companion-voice-history\.js/);
  assert.match(appSource, /app\.terminals-companion-voice-request\.js/);
  assert.match(appSource, /app\.terminals-companion-voice-playback\.js/);
  assert.doesNotMatch(companionVoiceSource, /sendTerminalAiPrompt/);
  assert.doesNotMatch(companionVoiceSource, /terminalCompanionInsertIntoTerminal/);
  assert.doesNotMatch(companionVoiceSource, /data-terminal-voice-enter/);
  assert.match(companionVoiceSource, /terminalVoiceConversationHtml/);
  assert.match(companionVoiceSource, /assistant \? "Vibyra" : "You"/);
  assert.match(companionVoiceSource, /appendTerminalVoiceMessage\(terminal, "user", prompt\)/);
  assert.match(companionVoiceSource, /appendTerminalVoiceMessage\(terminalCompanionActiveTerminal\(\) \|\| terminal, "assistant", reply\)/);
  assert.doesNotMatch(companionVoiceSource, /Preparing voice/);
});

test("terminal voice makes listening, processing, and speaking visually explicit", () => {
  assert.match(companionVoiceSource, /data-voice-phase=/);
  assert.match(companionVoiceSource, /MIC LIVE/);
  assert.match(companionVoiceSource, /Vibyra can hear you now/);
  assert.match(companionVoiceSource, /Vibyra is speaking/);
  assert.match(companionVoiceSource, /Vibyra isn't listening/);
  assert.doesNotMatch(companionVoiceSource, /Your microphone is off/);
  assert.match(companionVoiceSource, /aria-live="assertive"/);
  assert.match(companionVoiceStyles, /\[data-voice-phase="listening"\]/);
  assert.match(companionVoiceStyles, /\[data-voice-phase="speaking"\]/);
  assert.match(companionVoiceStyles, /prefers-reduced-motion: reduce/);
  assert.match(companionVoiceConversationStyles, /\.terminal-voice-message\.user/);
  assert.match(companionVoiceConversationStyles, /\.terminal-voice-message\.assistant/);
  assert.match(appSource, /app\.terminals-companion-voice\.css/);
  assert.match(appSource, /app\.terminals-companion-voice-conversation\.css/);
});

test("terminal chat companion executes actions and keeps their result visible", () => {
  assert.match(companionChatSource, /await terminalAiChatResultText\(result, actionContextScope\)/);
  assert.match(companionChatSource, /await runDesktopActions\(result\.actions, \{ desktopActionContextScope: actionContextScope \}\)/);
  assert.match(companionChatSource, /moveTerminalAiActionMessages\(thread, userMessage, pending\)/);
  assert.match(companionChatSource, /terminalId: terminal\?\.id/);
});

test("terminal project identity survives startup and backend reconciliation", () => {
  assert.match(chatSendSource, /project\?\.id \|\| String\(selectedProjectId \|\| ""\)/);
  assert.match(ptyRuntimeSource, /projectId: String\(session\.projectId \|\| ""\)/);
});

test("terminal setup waits for a persisted project to be verified", () => {
  assert.match(projectPickerSource, /function terminalProjectReadyForSetup/);
  assert.match(terminalControlsSource, /!terminalProjectReadyForSetup\(\)\) return/);
  assert.match(terminalPtySource, /"Loading project\.\.\."/);
});
