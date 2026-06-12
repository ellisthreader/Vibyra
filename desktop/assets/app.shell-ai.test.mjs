import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("../app.html", import.meta.url), "utf8");
const state = readFileSync(new URL("./app.state.js", import.meta.url), "utf8");
const shell = readFileSync(new URL("./app.shell.js", import.meta.url), "utf8");
const helpers = readFileSync(new URL("./app.render-helpers.js", import.meta.url), "utf8");
const pages = readFileSync(new URL("./app.pages.js", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("./app.shell-ai.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("./app.shell-ai.css", import.meta.url), "utf8");
const chatSend = readFileSync(new URL("./app.chat-send.js", import.meta.url), "utf8");
const terminalCompanion = readFileSync(new URL("./app.terminals-companion.js", import.meta.url), "utf8");

test("desktop primary navigation excludes the standalone Chat tab", () => {
  assert.doesNotMatch(state, /key: "chat", label: "Chat"/);
  assert.doesNotMatch(state, /key: "dashboard", label: "Home"/);
  assert.match(state, /key: "terminals", label: "Terminals"/);
  assert.match(state, /key: "projects", label: "Projects"/);
});

test("legacy chat routes open the shell AI sidebar from Projects only", () => {
  assert.match(helpers, /if \(page === "chat"\)/);
  assert.match(helpers, /shellAiOpen = true/);
  assert.match(helpers, /activePage !== "projects"/);
  assert.match(shell, /renderShellAiSidebar\(\)/);
  assert.match(shell, /activePage = "terminals"/);
});

test("Projects expose a Vibyra-only topbar chat panel", () => {
  assert.match(html, /id="shell-ai-panel"/);
  assert.match(html, /app\.shell-ai\.js/);
  assert.match(html, /app\.shell-ai\.css/);
  assert.match(sidebar, /activePage !== "projects"/);
  assert.match(sidebar, /class="shell-ai-topbar-button/);
  assert.match(sidebar, /src="\/app-assets\/vibyra\.png"/);
  assert.match(sidebar, /<strong>Vibyra AI<\/strong>/);
  assert.doesNotMatch(sidebar, /Editor|Preview|Memory|Talk/);
  assert.match(styles, /\.app\.shell-ai-open/);
  assert.match(styles, /\.shell-ai-panel\.open/);
});

test("shell AI sidebar supports persisted pointer and keyboard resizing", () => {
  assert.match(sidebar, /vibyra\.desktop\.shellAiWidth/);
  assert.match(sidebar, /data-shell-ai-resizer/);
  assert.match(sidebar, /role="separator"/);
  assert.match(sidebar, /setPointerCapture/);
  assert.match(sidebar, /"ArrowLeft", "ArrowRight", "Home", "End"/);
  assert.match(sidebar, /localStorage\.setItem\(shellAiWidthKey/);
  assert.match(styles, /--shell-ai-width/);
  assert.match(styles, /cursor: col-resize/);
  assert.match(styles, /focus-visible/);
});

test("desktop chat uses local Ollama without a model picker", () => {
  assert.doesNotMatch(sidebar, /open-ai-menu/);
  assert.doesNotMatch(sidebar, /data-model-group/);
  assert.doesNotMatch(sidebar, /data-effort/);
  assert.match(sidebar, /shell-ai-local-model/);
  assert.match(pages, /chat-local-model/);
  assert.doesNotMatch(pages, /id="open-ai-menu"/);
  assert.doesNotMatch(pages, /data-model-group/);
  assert.doesNotMatch(pages, /data-effort/);
  assert.match(chatSend, /const requestModel = "local"/);
  assert.match(chatSend, /provider: "local"/);
});

test("terminal workspace keeps its separate multi-tool companion", () => {
  for (const mode of ["editor", "preview", "chat", "memory"]) {
    assert.match(terminalCompanion, new RegExp(`\\["${mode}",`));
  }
  assert.match(shell, /terminalPage.*terminalAiTopbarButtonHtml/);
  assert.match(shell, /!terminalPage.*shellAiTopbarButtonHtml/);
});

test("shell chat commands do not expose terminal-only tools", () => {
  assert.doesNotMatch(state, /id: "phone", slash: "\/phone"/);
  assert.doesNotMatch(state, /id: "voice", slash: "\/voice"/);
  assert.doesNotMatch(state, /id: "memory", slash: "\/memory"/);
  assert.doesNotMatch(chatSend, /text === "\/phone"/);
  assert.doesNotMatch(chatSend, /\/phone, \/voice, \/memory/);
});
