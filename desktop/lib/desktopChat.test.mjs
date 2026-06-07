import test from "node:test";
import assert from "node:assert/strict";
import { appState } from "./state.mjs";
import { sendDesktopChat } from "./desktopChat.mjs";

test("desktop chat requires a verified desktop account session", async () => {
  resetDesktopChatState();

  await assert.rejects(
    () => sendDesktopChat({ prompt: "Hello" }, fakeChatResponse({ ok: true, reply: "Hi" })),
    /Log in to Vibyra Desktop/
  );
});

test("desktop chat sends a desktop-surface cloud chat payload", async () => {
  resetDesktopChatState();
  appState.desktopAccountToken = "account-token";
  let requestBody = null;

  const result = await sendDesktopChat({
    attachments: ["README.md"],
    history: [{ role: "user", text: "Earlier" }],
    mode: "chat",
    model: "gpt-5.4-mini",
    profileContext: { callName: "Ellis", work: "Founder", responseStyle: "Code-first: prioritize implementation details.", customInstructions: "Ask clarifying questions before detailed answers." },
    prompt: "Explain this project",
    reasoningEffort: "xhigh",
    skill: "review",
    tool: "analyze"
  }, async (url, options) => {
    assert.equal(String(url).endsWith("/api/chat"), true);
    assert.equal(options.headers.Authorization, "Bearer account-token");
    requestBody = JSON.parse(options.body);
    return jsonResponse({
      ok: true,
      reply: "Desktop answer",
      modelKey: "gpt-5.4-mini",
      app: { title: "Generated preview", html: "<main>Preview</main>" }
    });
  });

  assert.equal(result.reply, "Desktop answer");
  assert.deepEqual(result.app, { title: "Generated preview", url: "", html: "<main>Preview</main>" });
  assert.equal(requestBody.surface, "desktop");
  assert.equal(requestBody.mode, "chat");
  assert.equal(requestBody.model, "gpt-5.4-mini");
  assert.equal(requestBody.reasoningEffort, "xhigh");
  assert.equal(requestBody.skill, "review");
  assert.doesNotMatch(requestBody.prompt, /Selected desktop chat tool/);
  assert.match(requestBody.prompt, /Desktop profile preferences:/);
  assert.match(requestBody.prompt, /Call the user: Ellis/);
  assert.match(requestBody.prompt, /Preferred response style: Code-first: prioritize implementation details\./);
  assert.match(requestBody.prompt, /User work: Founder/);
  assert.match(requestBody.prompt, /User instructions: Ask clarifying questions before detailed answers\./);
  assert.match(requestBody.prompt, /Attached local context names: README\.md/);
});

test("desktop chat loads canonical memory for the selected project", async () => {
  resetDesktopChatState();
  appState.desktopAccountToken = "account-token";
  appState.cachedProjects = [{ id: "project-1", name: "Desktop Project", path: "/tmp/project-1" }];
  let chatPayload = null;

  await sendDesktopChat({ projectId: "project-1", prompt: "Continue the implementation" }, async (url, options = {}) => {
    if (String(url).includes("/api/project-memory/")) {
      return jsonResponse({ ok: true, memory: { entries: [{ id: "user-1", text: "Keep terminal memory project scoped.", source: "user" }] } });
    }
    chatPayload = JSON.parse(options.body);
    return jsonResponse({ ok: true, reply: "Done" });
  });

  assert.match(chatPayload.prompt, /Relevant desktop memory:/);
  assert.match(chatPayload.prompt, /Keep terminal memory project scoped\./);
});

test("desktop chat can use a connected OpenAI account without Vibyra credits", async () => {
  resetDesktopChatState();
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "sk-test-openai-key-1234567890";
  let requestBody = null;
  try {
    const result = await sendDesktopChat({
      model: "openai/gpt-4o-mini",
      prompt: "Use my OpenAI account",
      reasoningEffort: "high",
      tokenMode: "provider"
    }, async (url, options) => {
      assert.equal(String(url), "https://api.openai.com/v1/responses");
      assert.equal(options.headers.Authorization, "Bearer sk-test-openai-key-1234567890");
      requestBody = JSON.parse(options.body);
      return jsonResponse({ ok: true, output_text: "OpenAI answer", model: "gpt-4o-mini" });
    });

    assert.equal(result.reply, "OpenAI answer");
    assert.equal(result.providerBilling, "openai");
    assert.equal(result.creditCost, null);
    assert.equal(requestBody.model, "gpt-4o-mini");
    assert.match(requestBody.input, /Use my OpenAI account/);
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("desktop chat refreshes account membership from backend user payload", async () => {
  resetDesktopChatState();
  appState.desktopAccount = { id: 4, email: "user@example.test", name: "User", plan: "free" };
  appState.desktopAccountToken = "account-token";

  await sendDesktopChat({ model: "gpt-5.4-mini", prompt: "Hello" }, async () => jsonResponse({
    ok: true,
    reply: "Hi",
    user: {
      id: 4,
      email: "user@example.test",
      name: "User",
      plan: "builder",
      planBillingCycle: "annual",
      creditsBalance: 1900,
      creditsUsed: 80,
      monthlyCredits: 1980,
      dailyCreditsCap: 360,
      allowedModelTiers: ["free", "budget", "balanced", "premium"]
    }
  }));

  assert.equal(appState.desktopAccount.plan, "builder");
  assert.equal(appState.desktopAccount.planBillingCycle, "annual");
  assert.equal(appState.desktopAccount.creditsBalance, 1900);
  assert.equal(appState.desktopAccount.monthlyCredits, 1980);
  assert.deepEqual(appState.desktopAccount.allowedModelTiers, ["free", "budget", "balanced", "premium"]);
});

test("desktop chat ignores mobile-only tools and unsupported skills", async () => {
  resetDesktopChatState();
  appState.desktopAccountToken = "account-token";
  let requestBody = null;
  let requestUrl = "";

  const result = await sendDesktopChat({
    prompt: "A purple app icon",
    skill: "publish",
    tool: "image"
  }, async (url, options) => {
    requestUrl = String(url);
    assert.equal(requestUrl.endsWith("/api/chat"), true);
    assert.equal(options.headers.Authorization, "Bearer account-token");
    requestBody = JSON.parse(options.body);
    return jsonResponse({ ok: true, reply: "Desktop answer" });
  });

  assert.equal(requestBody.skill, "");
  assert.doesNotMatch(requestBody.prompt, /Selected desktop chat tool/);
  assert.equal(result.reply, "Desktop answer");
});

function fakeChatResponse(payload) {
  return async () => jsonResponse(payload);
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}

function resetDesktopChatState() {
  appState.desktopAccount = null;
  appState.desktopAccountToken = null;
  appState.cachedProjects = [];
}
