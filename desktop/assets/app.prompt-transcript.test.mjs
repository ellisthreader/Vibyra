import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./app.prompt-transcript.js", import.meta.url), "utf8");

test("prompt transcript client links prompt and outcome events", async () => {
  const requests = [];
  const context = vm.createContext({
    activeChatId: "chat-1",
    currentProject: () => ({ id: "project-1", name: "SaaS" }),
    fetch: async (url, options) => {
      requests.push({ body: JSON.parse(options.body), url });
      return {
        json: async () => requests.length === 1
          ? {
            event: "prompt",
            ok: true,
            sessionId: "desktop-chat:chat-1",
            startedAt: "2026-06-11T10:00:00.000Z",
            turnId: "turn-1"
          }
          : { event: "outcome", ok: true, turnId: "turn-1" },
        ok: true
      };
    },
    selectedProjectId: "project-1",
    terminalProjectLabel: () => "SaaS"
  });
  vm.runInContext(`${source}
this.persistPrompt = persistDesktopPromptTranscript;
this.persistOutcome = persistDesktopPromptOutcome;`, context);

  const turn = await context.persistPrompt("Build it", "desktop-chat", {
    model: "openai/gpt-5"
  });
  await context.persistOutcome(turn, {
    actions: [{ type: "open_terminals" }],
    response: "I will build it.",
    result: "Build queued.",
    status: "completed"
  }, "desktop-chat", { model: "openai/gpt-5" });

  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, "/desktop/prompt/transcript");
  assert.equal(requests[0].body.sessionId, "desktop-chat:chat-1");
  assert.equal(requests[0].body.prompt, "Build it");
  assert.equal(requests[1].body.event, "outcome");
  assert.equal(requests[1].body.turnId, "turn-1");
  assert.equal(requests[1].body.response, "I will build it.");
  assert.deepEqual(requests[1].body.actions, [{ type: "open_terminals" }]);
});
