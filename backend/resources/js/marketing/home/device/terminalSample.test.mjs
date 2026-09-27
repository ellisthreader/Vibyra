import assert from "node:assert/strict";
import test from "node:test";
import { demoProjects, providers, quickAgents, startedLines } from "./demoData.js";
import { createProject } from "./projectState.js";
import { terminalSampleReply } from "./terminalSample.js";

const orbit = demoProjects.find((project) => project.id === "orbit");
const data = createProject("orbit", "Orbit");

test("the opening workspace shows three AI companies and a local shell in a four-pane grid", () => {
    assert.deepEqual(orbit.sessions.map((session) => session.agent), ["claude", "codex", "gemini", "terminal"]);
    assert.deepEqual(orbit.sessions.map((session) => providers[session.agent].company), ["Anthropic", "OpenAI", "Google", "Local shell"]);
    assert.ok(orbit.sessions.every((session) => session.lines.length <= 7));
    assert.ok(quickAgents.includes("terminal"));
});

test("the sample shell launch uses the selected project path", () => {
    const shell = startedLines({ id: "terminal", name: "Terminal" }, "My Weekend");
    assert.equal(shell.agent, "terminal");
    assert.equal(shell.lines[0][1], "~/projects/my-weekend");
    assert.equal(shell.lines[1][1], "› zsh");
});

test("terminal responses stay local while opening the sample preview and resolving a choice", () => {
    const gemini = orbit.sessions.find((session) => session.agent === "gemini");
    assert.equal(terminalSampleReply("1", gemini, orbit, data, []).resolveAttention, true);
    assert.equal(terminalSampleReply("1", gemini, orbit, data, []).previewTitle, "A little better, every day.");
    assert.equal(terminalSampleReply("2", gemini, orbit, data, []).previewTitle, "Make today count.");
    assert.equal(terminalSampleReply("npm run dev", gemini, orbit, data, []).openTool, "preview");
    assert.match(terminalSampleReply("npm test", gemini, orbit, data, []).answer, /✓  App configuration is valid/);
    assert.match(terminalSampleReply("invent a feature", gemini, orbit, data, []).answer, /Sample terminal only/);
});
