import test from "node:test";
import assert from "node:assert/strict";
import { appState } from "./state.mjs";
import { sendDesktopChat } from "./desktopChat.mjs";

test("desktop chat returns local desktop actions without a cloud account", async () => {
  resetDesktopChatState();
  appState.cachedProjects = [{ id: "project-1", name: "Project One", path: "/tmp/project-1" }];

  const result = await sendDesktopChat({
    projectId: "project-1",
    prompt: "Open 8 terminals with Codex 5.5 fast full permissions"
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.actions, [{
    type: "open_terminals",
    count: 8,
    model: "gpt-5.5",
    effort: "low",
    permissionMode: "full",
    projectId: "project-1"
  }]);
});

test("desktop chat resolves a combined full-access launch to the named SaaS project", async () => {
  resetDesktopChatState();
  appState.cachedProjects = [{ id: "saas-project", name: "CombinedLaunchSaaS", path: "/tmp/saas" }];

  const result = await sendDesktopChat({
    prompt: "I want you to open six terminals using 5.5 GPT. Give them full permission. Open it on my project called CombinedLaunchSaaS."
  });

  assert.deepEqual(result.actions, [{
    type: "open_terminals",
    count: 6,
    model: "gpt-5.5",
    effort: "medium",
    permissionMode: "full",
    projectId: "saas-project"
  }]);
  assert.match(result.reply, /Opening 6 GPT-5\.5 terminals with full access in project CombinedLaunchSaaS/);
});

test("desktop chat keeps explicit permission follow-ups local", async () => {
  resetDesktopChatState();

  const result = await sendDesktopChat({
    prompt: "perfect thanks can you also give all 4 of the terminals full permissions pls",
    terminalId: "terminal-1"
  });

  assert.deepEqual(result.actions, [{
    type: "set_terminal_permissions",
    scope: "all",
    permissionMode: "full",
    terminalId: ""
  }]);
});

test("desktop chat uses recent task context for a vague subagent retry", async () => {
  resetDesktopChatState();
  appState.cachedProjects = [{ id: "saas", name: "SaaS", path: "/tmp/saas" }];

  const result = await sendDesktopChat({
    projectId: "saas",
    prompt: "still not working assign 8 subagents to diagonse and fix pls",
    history: [{
      role: "user",
      text: "try again and assign jobs to each terminal pls to find errors on terminal page"
    }]
  });

  assert.equal(result.actions[0].type, "run_terminal_tasks");
  assert.equal(result.actions[0].target, "existing");
  assert.equal(result.actions[0].tasks.length, 8);
  assert.match(result.actions[0].tasks[0].task, /terminal page/i);
});

test("desktop chat passes recent launch context into terminal task routing", async () => {
  resetDesktopChatState();
  appState.cachedProjects = [{ id: "saas", name: "SaaS", path: "/tmp/saas" }];

  const result = await sendDesktopChat({
    prompt: "Assign three terminals to audit the terminal page.",
    desktopActionContext: {
      recentTerminalBatch: {
        batchId: "batch-7",
        projectId: "saas",
        terminalIds: ["terminal-8", "terminal-9", "terminal-10"]
      }
    }
  });

  assert.equal(result.actions[0].target, "existing");
  assert.deepEqual(result.actions[0].terminalIds, ["terminal-8", "terminal-9", "terminal-10"]);
  assert.equal(result.actions[0].projectId, "saas");
  assert.equal(result.actions[0].tasks.length, 3);
});

test("desktop chat sanitizes recent launch context before parser use", async () => {
  resetDesktopChatState();
  appState.cachedProjects = [{ id: "saas", name: "SaaS", path: "/tmp/saas" }];

  const result = await sendDesktopChat({
    prompt: "Give two of them tasks to review terminal recovery.",
    desktopActionContext: {
      recentBatch: {
        id: "batch-7",
        projectId: "saas",
        ids: [" terminal-8 ", "", "terminal-8", "terminal-9", null]
      }
    }
  });

  assert.deepEqual(result.actions[0].terminalIds, ["terminal-8", "terminal-9"]);
  assert.equal(result.actions[0].target, "existing");
});

test("desktop chat returns an executable three-of-seven terminal assignment", async () => {
  resetDesktopChatState();
  appState.cachedProjects = [{ id: "saas", name: "SaaS", path: "/tmp/saas" }];

  const result = await sendDesktopChat({
    projectId: "saas",
    prompt: "now with the 7 terminals you just opened can you give 3 of them the job to find and diagonse errors on the terminal page on vibyra desktop app"
  });

  assert.equal(result.actions[0].type, "run_terminal_tasks");
  assert.equal(result.actions[0].target, "existing");
  assert.equal(result.actions[0].tasks.length, 3);
  assert.equal(new Set(result.actions[0].tasks.map(({ prompt }) => prompt)).size, 3);
  assert.match(result.actions[0].tasks[0].prompt, /Frontend reproduction and evidence reviewer/);
  assert.match(result.actions[0].tasks[1].prompt, /Frontend interaction and accessibility reviewer/);
  assert.match(result.actions[0].tasks[2].prompt, /Frontend state and architecture reviewer/);
  assert.match(result.actions[0].tasks[0].prompt, /Source project location: \/tmp\/saas/);
  assert.match(result.actions[0].tasks[2].prompt, /now with the 7 terminals you just opened/i);
});

test("desktop chat assigns counted work to open terminals without launching more", async () => {
  resetDesktopChatState();
  appState.cachedProjects = [{ id: "saas", name: "SaaS", path: "/tmp/saas" }];

  const result = await sendDesktopChat({
    projectId: "saas",
    prompt: "with the terminals open now assign 3 terminals to find frontend fixes to terminal picker"
  });

  assert.equal(result.actions[0].type, "run_terminal_tasks");
  assert.equal(result.actions[0].target, "existing");
  assert.equal(result.actions[0].tasks.length, 3);
  assert.match(result.actions[0].tasks[2].prompt, /Root-cause and implementation lead/);
});

test("desktop chat keeps numbered open-terminal subset assignments on existing sessions", async () => {
  resetDesktopChatState();
  appState.cachedProjects = [{ id: "saas", name: "SaaS", path: "/tmp/saas" }];

  const result = await sendDesktopChat({
    projectId: "saas",
    prompt: "the 4 terminals open assign 2 of them to do frontend auidt of terminal page"
  });

  assert.equal(result.actions[0].type, "run_terminal_tasks");
  assert.equal(result.actions[0].target, "existing");
  assert.equal(result.actions[0].tasks.length, 2);
  assert.match(result.actions[0].tasks[0].prompt, /frontend audit of terminal page/i);
});

test("desktop chat assigns read-only frontend audits to terminals just opened", async () => {
  resetDesktopChatState();
  appState.cachedProjects = [{ id: "saas", name: "SaaS", path: "/tmp/saas" }];

  const result = await sendDesktopChat({
    projectId: "saas",
    prompt: "Assign three of the new terminals you just opened to do a front-end audit of the terminal page. Do not change any code, just find problems."
  });

  assert.equal(result.actions[0].type, "run_terminal_tasks");
  assert.equal(result.actions[0].target, "existing");
  assert.equal(result.actions[0].tasks.length, 3);
  for (const task of result.actions[0].tasks) {
    assert.match(task.prompt, /Strictly read-only/);
    assert.match(task.prompt, /no files were changed/i);
  }
});

test("desktop chat executes the exact recently-opened read-only diagnosis request", async () => {
  resetDesktopChatState();
  appState.cachedProjects = [{ id: "saas", name: "SaaS", path: "/tmp/saas" }];

  const result = await sendDesktopChat({
    projectId: "saas",
    prompt: "Now, I want you to assign three of the terminals you have just opened to do a front-end diagnosis of the terminal page without changing any code, just let me know what needs changing."
  });

  assert.equal(result.actions[0].type, "run_terminal_tasks");
  assert.equal(result.actions[0].target, "existing");
  assert.equal(result.actions[0].tasks.length, 3);
  for (const task of result.actions[0].tasks) {
    assert.match(task.prompt, /Strictly read-only/);
    assert.match(task.prompt, /no files were changed/i);
    assert.doesNotMatch(task.prompt, /implement the smallest complete fix/i);
  }
});

test("desktop chat executes the reported use-launched frontend audit request", async () => {
  resetDesktopChatState();
  appState.cachedProjects = [{ id: "saas", name: "SaaS", path: "/tmp/saas" }];

  const result = await sendDesktopChat({
    projectId: "saas",
    prompt: "I want you to use three of them terminals you have just launched, front a front-end order of the terminal page."
  });

  assert.equal(result.actions[0].type, "run_terminal_tasks");
  assert.equal(result.actions[0].target, "existing");
  assert.equal(result.actions[0].tasks.length, 3);
  for (const task of result.actions[0].tasks) {
    assert.match(task.prompt, /front-end audit of the terminal page/i);
    assert.match(task.prompt, /Strictly read-only/);
  }
});

test("desktop chat replaces a false local-model terminal capability denial", async () => {
  resetDesktopChatState();

  const result = await sendDesktopChat({
    provider: "local",
    prompt: "Please put the terminals to work checking the frontend."
  }, async (url) => {
    if (String(url).endsWith("/api/tags")) {
      return jsonResponse({ models: [{ name: "qwen3:4b" }] });
    }
    return jsonResponse({
      model: "qwen3:4b",
      message: {
        content: "I cannot run commands in physical terminals because I am not a terminal emulator."
      }
    });
  });

  assert.match(result.reply, /Vibyra Desktop can open, close, and assign work/i);
  assert.match(result.reply, /no terminal action ran/i);
  assert.doesNotMatch(result.reply, /cannot run commands|not a terminal emulator/i);
});

test("desktop chat resolves an explicitly named terminal project", async () => {
  resetDesktopChatState();
  appState.cachedProjects = [{
    id: "L2hvbWUvZWxsaXMvRGVza3RvcC9TYWFT",
    name: "SaaS",
    path: "/home/ellis/Desktop/SaaS"
  }];

  const result = await sendDesktopChat({
    projectId: "wrong-project",
    prompt: "open 7 5.5 gpt pro terminals on the project saas on my desktop"
  });

  assert.equal(result.actions[0].projectId, "L2hvbWUvZWxsaXMvRGVza3RvcC9TYWFT");
  assert.equal("projectName" in result.actions[0], false);
  assert.match(result.reply, /project SaaS/i);
});

test("desktop chat resolves the project for a terminal task batch", async () => {
  resetDesktopChatState();
  appState.cachedProjects = [{
    id: "L2hvbWUvZWxsaXMvRGVza3RvcC9TYWFT",
    name: "SaaS",
    path: "/home/ellis/Desktop/SaaS"
  }];

  const result = await sendDesktopChat({
    prompt: [
      'Delegate separate terminal tasks in project "SaaS":',
      "- Inspect the terminal renderer",
      "- Run the terminal action tests"
    ].join("\n")
  });

  assert.equal(result.actions[0].type, "run_terminal_tasks");
  assert.equal(result.actions[0].projectId, "L2hvbWUvZWxsaXMvRGVza3RvcC9TYWFT");
  assert.equal("projectName" in result.actions[0], false);
  assert.equal(result.actions[0].tasks.length, 2);
});

test("desktop chat resolves a discovered project path suffix", async () => {
  resetDesktopChatState();

  const result = await sendDesktopChat({
    prompt: "open 5 gpt5.5 terminals and open them in project Desktop/SaaS"
  });

  assert.equal(result.actions[0].model, "gpt-5.5");
  assert.equal(result.actions[0].projectId, "L2hvbWUvZWxsaXMvRGVza3RvcC9TYWFT");
});

test("desktop chat refuses ambiguous explicitly named terminal projects", async () => {
  resetDesktopChatState();
  appState.cachedProjects = [
    { id: "saas-1", name: "SaaS", path: "/tmp/saas-1" },
    { id: "saas-2", name: "saas", path: "/tmp/saas-2" }
  ];

  await assert.rejects(
    () => sendDesktopChat({ prompt: "Open a terminal in project SaaS" }),
    /More than one desktop project is named "SaaS"/
  );
});

test("desktop chat refuses a stale inherited terminal project", async () => {
  resetDesktopChatState();

  await assert.rejects(
    () => sendDesktopChat({ projectId: "stale-project", prompt: "Open a terminal" }),
    /selected terminal project is no longer available/
  );
});

test("desktop chat requires a verified desktop account session", async () => {
  resetDesktopChatState();

  await assert.rejects(
    () => sendDesktopChat({ prompt: "Hello" }, fakeChatResponse({ ok: true, reply: "Hi" })),
    /Log in to Vibyra Desktop/
  );
});

test("desktop chat uses local Vibyra AI without a cloud account", async () => {
  resetDesktopChatState();
  const requests = [];

  const result = await sendDesktopChat({
    prompt: "Explain Vibyra",
    provider: "local"
  }, async (url, options = {}) => {
    requests.push(String(url));
    if (String(url).endsWith("/api/tags")) return jsonResponse({ models: [{ name: "qwen3:4b" }] });
    const body = JSON.parse(options.body);
    assert.match(body.messages.at(-1).content, /Explain Vibyra/);
    return jsonResponse({ model: "qwen3:4b", message: { content: "Private local answer" } });
  });

  assert.equal(result.reply, "Private local answer");
  assert.equal(result.local, true);
  assert.equal(requests.some((url) => url.endsWith("/api/chat")), true);
  assert.equal(requests.some((url) => url.includes("/api/chat") && !url.includes("11434")), false);
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
    if (String(url).endsWith("/vault")) {
      return jsonResponse({
        ok: true,
        vault: {
          nodes: [{
            id: "architecture",
            type: "document",
            name: "Architecture.md",
            markdown: "The desktop bridge owns terminal memory injection."
          }]
        }
      });
    }
    if (String(url).includes("/api/project-memory/")) {
      return jsonResponse({ ok: true, memory: { entries: [{ id: "user-1", text: "Keep terminal memory project scoped.", source: "user" }] } });
    }
    chatPayload = JSON.parse(options.body);
    return jsonResponse({ ok: true, reply: "Done" });
  });

  assert.match(chatPayload.prompt, /Relevant desktop memory:/);
  assert.match(chatPayload.prompt, /The desktop bridge owns terminal memory injection\./);
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
