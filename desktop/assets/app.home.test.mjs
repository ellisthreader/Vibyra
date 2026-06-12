import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("../app.html", import.meta.url), "utf8");
const state = readFileSync(new URL("./app.state.js", import.meta.url), "utf8");
const pages = readFileSync(new URL("./app.pages.js", import.meta.url), "utf8");
const helpers = readFileSync(new URL("./app.render-helpers.js", import.meta.url), "utf8");
const shell = readFileSync(new URL("./app.shell.js", import.meta.url), "utf8");
const icons = readFileSync(new URL("./app.icons.js", import.meta.url), "utf8");
const authSubmit = readFileSync(new URL("./app.auth-submit.js", import.meta.url), "utf8");
const authUi = readFileSync(new URL("./app.auth-ui.js", import.meta.url), "utf8");
const projectRender = readFileSync(new URL("./app.projects-render.js", import.meta.url), "utf8");

test("desktop shell is terminal-first without a Home destination", () => {
  assert.doesNotMatch(state, /key: "dashboard"/);
  assert.doesNotMatch(state, /label: "Home"/);
  assert.match(state, /key: "terminals", label: "Terminals"/);
  assert.match(state, /key: "projects", label: "Projects"/);
  assert.match(state, /let activePage = pages\.some\(\(page\) => page\.key === storedPage\) \? storedPage : "terminals"/);
  assert.match(shell, /activePage = "terminals"/);
  assert.doesNotMatch(shell, /renderDashboard\(\)/);
  assert.doesNotMatch(shell, /content home-content/);
});

test("auth and stale saved routes land on Terminals", () => {
  assert.match(authSubmit, /localStorage\.setItem\("vibyra\.desktop\.page", "terminals"\)/);
  assert.match(authSubmit, /activePage = "terminals"/);
  assert.match(authUi, /\? activePage : "terminals"/);
  assert.match(helpers, /pageTitle\(page\) \{ return page === "projects" \? "Projects" : page === "terminals" \? "Terminals"/);
});

test("rail recent chats are removed from the desktop IA", () => {
  assert.match(shell, /function renderRecentChats\(\)/);
  assert.match(shell, /nodes\.railRecents\.hidden = true/);
  assert.doesNotMatch(shell, /Recent chats/);
  assert.doesNotMatch(shell, /rail-new-chat/);
  assert.doesNotMatch(shell, /openRecentChat\(button\.dataset\.chatId\)/);
});

test("Projects open through terminal setup instead of chat", () => {
  assert.match(projectRender, /data-project-terminal/);
  assert.doesNotMatch(projectRender, /data-project-chat/);
  assert.match(pages, /openProjectInTerminalSetup\(button\.dataset\.projectSelect/);
  assert.match(pages, /openProjectInTerminalSetup\(button\.dataset\.projectTerminal/);
  assert.match(icons, /function openProjectInTerminalSetup/);
  assert.match(icons, /setupProjectId = selectedProjectId/);
  assert.match(icons, /localStorage\.setItem\(setupProjectKey, selectedProjectId\)/);
  assert.match(icons, /openTerminalBatchSetup\(selectedProjectId, 1\)/);
  assert.match(icons, /setPage\("terminals"\)/);
});

test("Projects phone pairing empty state stays compact", () => {
  assert.match(projectRender, /Connect iPhone/);
  assert.match(projectRender, /Pair Vibyra on your iPhone to show mobile projects here\./);
  assert.doesNotMatch(projectRender, /Connect your iPhone/);
  assert.doesNotMatch(projectRender, /Open Vibyra on your iPhone/);
  assert.doesNotMatch(projectRender, /projects-phone-prompt/);
  assert.doesNotMatch(pages, /projectsPhonePromptHtml/);
  assert.doesNotMatch(html, /app\.projects-phone\.css/);
});
