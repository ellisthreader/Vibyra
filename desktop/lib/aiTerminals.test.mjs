import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_AI_TERMINAL_SESSIONS,
  createAiTerminalSession,
  listAiTerminalSessions,
  resetAiTerminalSessionsForTests,
  sendAiTerminalPrompt
} from "./aiTerminals.mjs";

test("AI terminals enforce the desktop session cap", () => {
  resetAiTerminalSessionsForTests();

  for (let index = 0; index < MAX_AI_TERMINAL_SESSIONS; index += 1) {
    createAiTerminalSession({ title: `Terminal ${index + 1}` });
  }

  assert.equal(listAiTerminalSessions().length, MAX_AI_TERMINAL_SESSIONS);
  assert.throws(() => createAiTerminalSession(), (error) => {
    assert.equal(error.status, 429);
    assert.equal(error.code, "AI_TERMINAL_SESSION_LIMIT");
    return true;
  });
});

test("AI terminal prompts proxy through the desktop chat contract", async () => {
  resetAiTerminalSessionsForTests();
  const session = createAiTerminalSession({
    model: "gpt-5.4-mini",
    projectId: "project-1",
    reasoningEffort: "high"
  });
  let requestBody = null;

  const result = await sendAiTerminalPrompt(session.id, {
    history: [{ role: "user", content: "Earlier terminal prompt" }],
    model: "claude-sonnet-4.5",
    prompt: "Review the auth route",
    reasoningEffort: "xhigh"
  }, async (body) => {
    requestBody = body;
    return {
      ok: true,
      reply: "Route reviewed",
      modelKey: body.model,
      creditCost: 2,
      creditsBalance: 98
    };
  });

  assert.equal(requestBody.prompt, "Review the auth route");
  assert.equal(requestBody.model, "claude-sonnet-4.5");
  assert.equal(requestBody.reasoningEffort, "xhigh");
  assert.equal(requestBody.projectId, "project-1");
  assert.deepEqual(requestBody.history, [{ role: "user", text: "Earlier terminal prompt" }]);
  assert.equal(result.reply, "Route reviewed");
  assert.equal(result.session.messages.length, 2);
  assert.equal(result.session.messages[0].role, "user");
  assert.equal(result.session.messages[1].role, "assistant");
});

test("AI terminal preserves chat rate-limit metadata on proxy errors", async () => {
  resetAiTerminalSessionsForTests();
  const session = createAiTerminalSession();
  const limited = new Error("Credits reset later");
  limited.status = 429;
  limited.code = "billing_credits_exhausted";
  limited.resetAt = "2026-05-20T00:00:00.000Z";
  limited.burstCreditsResetAt = "2026-05-19T12:00:00.000Z";

  await assert.rejects(
    () => sendAiTerminalPrompt(session.id, { prompt: "Hello" }, async () => {
      throw limited;
    }),
    (error) => {
      assert.equal(error.status, 429);
      assert.equal(error.code, "billing_credits_exhausted");
      assert.equal(error.resetAt, "2026-05-20T00:00:00.000Z");
      assert.equal(error.burstCreditsResetAt, "2026-05-19T12:00:00.000Z");
      return true;
    }
  );
});
