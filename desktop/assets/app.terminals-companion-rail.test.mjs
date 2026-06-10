import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shellSource = readFileSync(new URL("./app.shell.js", import.meta.url), "utf8");
const companionSource = readFileSync(new URL("./app.terminals-companion.js", import.meta.url), "utf8");
const companionContextSource = readFileSync(new URL("./app.terminals-companion-context.js", import.meta.url), "utf8");
const companionStyles = readFileSync(new URL("./app.terminals-companion.css", import.meta.url), "utf8");
const companionChatSource = readFileSync(new URL("./app.terminals-companion-chat.js", import.meta.url), "utf8");
const companionChatStyles = readFileSync(new URL("./app.terminals-companion-chat.css", import.meta.url), "utf8");
const companionVoiceStyles = readFileSync(new URL("./app.terminals-companion-voice.css", import.meta.url), "utf8");
const companionVoiceConversationStyles = readFileSync(new URL("./app.terminals-companion-voice-conversation.css", import.meta.url), "utf8");
const terminalThemeControlStyles = readFileSync(new URL("./app.theme-terminals-controls.css", import.meta.url), "utf8");
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
const companionVoiceHistorySource = readFileSync(new URL("./app.terminals-companion-voice-history.js", import.meta.url), "utf8");
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
  assert.match(companionStyles, /\.terminal-companion--entering\s*\{\s*animation: terminal-companion-enter 160ms/);
  assert.match(companionSource, /terminalCompanionHtml\(\{ entering: true \}\)/);
  assert.match(companionStyles, /prefers-reduced-motion: reduce/);
});

test("terminal setup companion uses the selected pre-launch project context", () => {
  const companionMemorySource = readFileSync(new URL("./app.terminals-companion-memory.js", import.meta.url), "utf8");
  assert.match(companionContextSource, /function terminalCompanionDisplayTerminal/);
  assert.match(companionContextSource, /terminalProjectForSetup\(\)/);
  assert.match(companionSource, /terminalMemoryHtml\(displayTerminal\)/);
  assert.match(companionMemorySource, /function terminalMemoryHtml\(terminal = terminalCompanionActiveTerminal\(\)\)/);
  assert.match(appSource, /app\.terminals-companion-context\.js/);
});

test("terminal chat companion keeps its compact draft composer", () => {
  assert.match(companionSource, /terminal-companion-shell-actions/);
  assert.match(companionChatSource, /draft: ""/);
  assert.match(companionChatSource, /data-terminal-ai-prompt/);
  assert.match(companionChatSource, /data-terminal-ai-surface="voice"/);
  assert.match(companionChatSource, /terminalVoiceHtml\(\)/);
  assert.match(companionChatSource, /thread\.draft = input\.value/);
  assert.match(companionChatStyles, /grid-template-rows: minmax\(0, 1fr\) auto/);
  assert.match(companionChatStyles, /terminal-ai-chat-composer-foot/);
  assert.match(companionChatStyles, /grid-template-columns: minmax\(0, 1fr\) 330px/);
  assert.match(companionChatStyles, /\.terminal-companion--chat[\s\S]*grid-template-rows: auto minmax\(0, 1fr\)/);
  assert.doesNotMatch(companionSource, /terminal-companion-stack/);
});

test("terminal workspace modes replace one full-height companion body", () => {
  const memoryStyles = readFileSync(new URL("./app.terminals-memory.css", import.meta.url), "utf8");
  assert.match(companionSource, /terminal-companion-primary/);
  assert.doesNotMatch(companionSource, /terminal-companion-stack/);
  assert.match(memoryStyles, /\.terminal-memory-section\.active\s*\{[\s\S]*height: 100%/);
  assert.match(terminalThemeControlStyles, /\.terminal-companion--memory\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\)/s);
  assert.doesNotMatch(terminalThemeControlStyles, /\.terminal-companion--memory\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(0, 1fr\)/s);
});

test("terminal navigation exposes one sidebar launcher and one right workspace switcher", () => {
  assert.match(companionSource, /function terminalCompanionToolbarHtml\(\) \{\s+return "";/);
  assert.match(companionSource, /function terminalCompanionStandaloneToolbarHtml\(\) \{\s+return "";/);
  assert.match(companionSource, /terminal-sidebar-topbar-button[\s\S]*icon\("sidebar"\)/);
  assert.match(companionSource, /data-terminal-companion-toggle/);
  assert.match(companionChatStyles, /\.terminal-sidebar-topbar-button\s*\{[\s\S]*width: 32px/);
  for (const mode of ["editor", "preview", "chat", "memory"]) {
    assert.match(companionSource, new RegExp(`\\["${mode}",`));
  }
  assert.match(companionSource, /terminalCompanionModes = new Set\(\["editor", "preview", "chat", "phone", "memory"\]\)/);
  assert.match(companionSource, /aria-label="Right workspace"/);
  assert.match(companionSource, /terminal-companion-tabs/);
  assert.doesNotMatch(companionSource, />Workspace</);
  assert.doesNotMatch(companionSource, /terminal-companion-brand/);
  assert.doesNotMatch(companionSource, /terminal-memory-section--stacked/);
});

test("terminal voice is a one-control AI conversation", () => {
  assert.match(companionVoiceSource, /Alt\+V/);
  assert.doesNotMatch(companionVoiceSource, /Back to chat/);
  assert.match(companionVoiceSource, /toggleTerminalVoice/);
  assert.match(companionChatSource, /data-terminal-ai-surface="voice"/);
  assert.match(companionChatSource, /function openTerminalAiVoice/);
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
  assert.doesNotMatch(companionVoiceHistorySource, /: "Ready"/);
  assert.match(companionVoiceSource, /const userMessage = appendTerminalVoiceMessage\(terminal, "user", prompt\)/);
  assert.match(companionVoiceSource, /appendTerminalVoiceReply\(userMessage, reply, terminal\)/);
  assert.match(companionVoiceHistorySource, /\.find\(\(candidate\) => candidate\.includes\(userMessage\)\)/);
  assert.doesNotMatch(companionVoiceSource, /Preparing voice/);
});

test("terminal voice makes listening, processing, and speaking visually explicit", () => {
  assert.match(companionVoiceSource, /data-voice-phase=/);
  assert.match(companionVoiceSource, /terminalVoiceStatusDetail/);
  assert.match(companionVoiceSource, /MIC LIVE/);
  assert.match(companionVoiceSource, /Vibyra can hear you now/);
  assert.match(companionVoiceSource, /Vibyra is speaking/);
  assert.match(companionVoiceSource, /Vibyra isn't listening/);
  assert.doesNotMatch(companionVoiceSource, /Your microphone is off/);
  assert.match(companionVoiceSource, /aria-live="assertive"/);
  assert.match(companionVoiceStyles, /\[data-voice-phase="listening"\]/);
  assert.match(companionVoiceStyles, /\[data-voice-phase="speaking"\]/);
  assert.match(companionVoiceStyles, /\.terminal-voice-stage/);
  assert.match(companionVoiceStyles, /\.terminal-voice-visual/);
  assert.match(companionVoiceConversationStyles, /grid-template-rows: auto minmax\(0, 1fr\)/);
  assert.match(companionVoiceConversationStyles, /\.terminal-voice-conversation\s*\{[^}]*background: transparent;[^}]*border: 0;[^}]*border-radius: 0;/s);
  assert.match(companionVoiceConversationStyles, /\.terminal-voice-conversation-head\s*\{[^}]*border: 0;/s);
  assert.match(companionVoiceStyles, /prefers-reduced-motion: reduce/);
  assert.match(companionVoiceConversationStyles, /\.terminal-voice-message\.user\s*\{[^}]*justify-self: end;/s);
  assert.match(companionVoiceConversationStyles, /\.terminal-voice-message\.assistant\s*\{[^}]*justify-self: start;/s);
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
