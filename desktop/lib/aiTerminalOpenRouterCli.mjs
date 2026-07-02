import readline from "node:readline/promises";
import { spawn } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import { renderVibyraVLogo } from "./aiTerminalVibyraLogo.mjs";
import { homedir } from "node:os";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  commandIsKnown,
  commandIsLocal,
  parseProviderInput,
  providerCommandHelp,
  providerCommandPrompt,
  terminalCommandProfile
} from "./aiTerminalCommandProfiles.mjs";
import {
  isAutoModel,
  providerInfoForModel,
  providerTokens
} from "./aiTerminalVibyraAgentBranding.mjs";
import {
  formatElapsedDuration,
  renderProviderBrandLogo,
  renderTerminalMarkdown,
  taskCompletionText
} from "./aiTerminalVibyraAgentPresentation.mjs";
import {
  formatTranscriptHistory,
  listWorkspaceEntries,
  readWorkspaceGitStatus,
  removeStagedContext,
  resolveWorkspacePath
} from "./aiTerminalVibyraAgentWorkspace.mjs";

export { providerInfoForModel };

const MAX_HISTORY = 8;
const MAX_TRANSCRIPT = 80;
const STANDARD_SHELL_COMMANDS = new Set([
  "git status", "npm install", "npm run dev", "npm run build", "npm test", "pytest"
]);
const VIBYRA_PURPLE = "38;2;109;59;255";
const VIBYRA_LILAC = "38;2;139;92;255";
const VIBYRA_PINK = "38;2;242;58;205";
const VIBYRA_BLUE = "38;2;76;163;255";
const VIBYRA_LOGO_PURPLE = "38;2;123;44;255";
const VIBYRA_LOGO_PINK = "38;2;255;53;200";

export function promptLabelForModel(modelKey, color = true) {
  const info = providerInfoForModel(modelKey);
  const glyph = isAutoModel(modelKey) ? "❯" : info.theme?.prompt?.glyph || "❯";
  const label = isAutoModel(modelKey) ? `${glyph} auto` : `${info.prompt} ${glyph}`;
  return `${ansi(label, info.color, color)} `;
}

export function renderIntroForModel({
  modelKey = "auto",
  reasoningEffort = "medium",
  cwd = process.cwd(),
  columns = 100,
  color = true,
  permissionMode = "standard",
  tokenMode = "vibyra"
} = {}) {
  if (isAutoModel(modelKey)) {
    return renderAutoIntro({ cwd, columns, color, permissionMode, tokenMode });
  }
  const info = providerInfoForModel(modelKey);
  const width = Math.max(60, Math.min(96, Number(columns) || 88));
  const inner = width - 2;
  const family = info.modelFamily ? `${info.modelFamily} · ` : "";
  const lines = [
    "",
    ...renderProviderBrandLogo(info, color, { maxWidth: inner }).map((line) => center(line, inner)),
    center(`${ansi(info.name, info.color, color)} via Vibyra Agent`, inner),
    "",
    `model      ${family}${displayModel(modelKey)}`,
    `workspace  ${displayDirectory(cwd)}`,
    `reasoning  ${reasoningEffort}`,
    `access     ${accessLabel(permissionMode)}`,
    `billing    ${terminalBillingLabel(tokenMode)}`,
    "",
    "Real file tools, shell activity, and persistent thread resume.",
    "/help commands · ! shell · Ctrl+C cancel"
  ];

  return [
    `${ansi("╭", info.color, color)}${"─".repeat(inner)}${ansi("╮", info.color, color)}`,
    ...lines.map((line) => boxLine(line, inner, info.color, color)),
    `${ansi("╰", info.color, color)}${"─".repeat(inner)}${ansi("╯", info.color, color)}`,
    "",
  ].join("\r\n");
}

function renderAutoIntro({ cwd, columns, color, permissionMode, tokenMode }) {
  const width = Math.max(58, Math.min(92, Number(columns) || 88));
  const inner = width - 2;
  const lines = [
    "",
    ...renderVibyraVLogo({ color }).map((line) => center(line, inner)),
    "",
    center(`${ansi("VIBYRA AGENT", VIBYRA_LOGO_PURPLE, color)} ${ansi("AUTO", VIBYRA_LOGO_PINK, color)}`, inner),
    center("Describe the job. Vibyra selects the model.", inner),
    "",
    `workspace  ${displayDirectory(cwd)}`,
    "routing    best-fit model for first task",
    `access     ${accessLabel(permissionMode)}`,
    `billing    ${terminalBillingLabel(tokenMode)}`,
    "",
    "Real tools start after routing. The selected provider stays visible.",
    "/help commands · ! shell · Ctrl+C cancel"
  ];
  return [
    `${ansi("╭", VIBYRA_PURPLE, color)}${"─".repeat(inner)}${ansi("╮", VIBYRA_PINK, color)}`,
    ...lines.map((line) => boxLine(line, inner, VIBYRA_LILAC, color)),
    `${ansi("╰", VIBYRA_BLUE, color)}${"─".repeat(inner)}${ansi("╯", VIBYRA_PINK, color)}`,
    ""
  ].join("\r\n");
}

export function formatAssistantReply(reply, modelKey = "auto", color = true, options = {}) {
  const info = providerInfoForModel(modelKey);
  const token = providerTokens(info).assistant;
  const lines = renderTerminalMarkdown(reply, color).split(/\r?\n/);
  if (options.showModel) {
    return [
      `${ansi(token, info.color, color)} ${info.name} via Vibyra Agent · ${displayModel(modelKey)}`,
      ...lines.map((line) => `  ${line}`)
    ].join("\r\n");
  }
  return lines.map((line, index) => index === 0
    ? `${ansi(token, info.color, color)} ${line}`
    : `  ${line}`).join("\r\n");
}

export function autoRoutingModel(result = {}) {
  const routing = result?.autoRouting;
  const candidates = [
    routing?.selectedModelKey,
    routing?.modelKey,
    routing?.selectedModel,
    routing?.model,
    routing?.route?.modelKey,
    typeof routing === "string" ? routing : "",
    result?.modelKey
  ];
  return candidates
    .map((value) => String(value || "").trim())
    .find((value) => value && !isAutoModel(value)) || "auto";
}

export function formatAutoRoutingStatus(result = {}, color = true) {
  const modelKey = autoRoutingModel(result);
  if (isAutoModel(modelKey)) {
    return `${ansi("✦", VIBYRA_LILAC, color)} Vibyra matched the prompt.`;
  }
  const info = providerInfoForModel(modelKey);
  const reason = String(result?.autoRouting?.reason || "").trim();
  return `${ansi("✓", VIBYRA_PURPLE, color)} Routed to ${ansi(displayModel(modelKey), info.color, color)} · ${info.name}${reason ? `\r\n  ${reason}` : ""}`;
}

export function formatAutoMatchingStatus(color = true) {
  return `${ansi("✦", VIBYRA_PURPLE, color)} Vibyra is matching your prompt...\r\n  Analyzing task, context, and reasoning needs.`;
}

export function formatAutoTransitionStatus(modelKey, color = true) {
  const info = providerInfoForModel(modelKey);
  return `${ansi("↳", VIBYRA_LILAC, color)} Vibyra Agent selected ${ansi(displayModel(modelKey), info.color, color)}. Running your prompt now.`;
}

export function formatAutoChatTransitionStatus(modelKey, color = true) {
  const info = providerInfoForModel(modelKey);
  return `${ansi("↳", VIBYRA_LILAC, color)} Using ${ansi(displayModel(modelKey), info.color, color)} for this prompt.`;
}

export function autoRoutingUsesAgent(result = {}) {
  return String(result?.autoRouting?.category || "").trim() !== "fast_general";
}

export function formatProviderWorkingStatus(modelKey, color = true, elapsedMs = 0) {
  const info = providerInfoForModel(modelKey);
  const token = providerTokens(info).activity;
  const elapsed = elapsedMs > 0 ? ` · ${formatElapsedDuration(elapsedMs)}` : "";
  const status = info.theme?.status?.working || "working";
  return `${ansi(token, info.color, color)} ${info.name} via Vibyra Agent · ${status}${elapsed}`;
}

export function interactivePromptForModel(modelKey, _columns = 100, color = true) {
  return promptLabelForModel(modelKey, color);
}

export function promptFrameCloseForModel() {
  return "";
}

export function terminalColorEnabled(environment = process.env) {
  const explicit = String(environment.VIBYRA_TERMINAL_COLOR || "").trim();
  if (explicit === "1") return true;
  if (explicit === "0") return false;
  return environment.NO_COLOR !== "1";
}

if (isMainModule()) runTerminal();

function runTerminal() {
  const state = {
    model: process.env.VIBYRA_OPENROUTER_MODEL || "auto",
    reasoningEffort: normalizeReasoningEffort(process.env.VIBYRA_REASONING_EFFORT),
    tokenMode: normalizeTokenMode(process.env.VIBYRA_TOKEN_MODE),
    projectId: process.env.VIBYRA_TERMINAL_PROJECT_ID || "",
    permissionMode: normalizePermissionMode(process.env.VIBYRA_PERMISSION_MODE),
    history: [],
    transcript: [],
    agentSession: { threadId: "" },
    stagedContexts: [],
    activeProcess: null,
    cancellationRequested: false,
    lastInterruptAt: 0,
    workspaceRoot: process.cwd()
  };
  const desktopUrl = normalizeDesktopUrl(process.env.VIBYRA_DESKTOP_URL, process.env.VIBYRA_DESKTOP_PORT);
  const color = terminalColorEnabled();
  const rl = readline.createInterface({
    input,
    output,
    terminal: true,
    historySize: 100,
    prompt: interactivePromptForModel(state.model, output.columns || 100, color)
  });

  printIntro({
    model: state.model,
    reasoningEffort: state.reasoningEffort,
    cwd: process.cwd(),
    permissionMode: state.permissionMode,
    tokenMode: state.tokenMode,
    color
  });
  rl.prompt();

  let commandQueue = Promise.resolve();
  rl.on("line", (line) => {
    const immediate = parseProviderInput(line);
    if (state.activeProcess && immediate.kind === "slash" && immediate.command === "/stop") {
      const stopped = cancelActiveProcess(state);
      writeSystemLine(state, state.model, stopped ? "Cancellation requested." : "No task is currently running.", color);
      return;
    }
    commandQueue = commandQueue.then(() => processTerminalLine(line)).catch((error) => {
      writeSystemLine(state, state.model, error instanceof Error ? error.message : "Terminal command failed.", color, true);
    });
  });

  async function processTerminalLine(line) {
    output.write(promptFrameCloseForModel(state.model, output.columns || 100, color));
    const prompt = String(line || "").trim();
    if (!prompt) {
      if (!rl.closed) rl.prompt();
      return;
    }
    try {
      const profile = terminalCommandProfile(state.model);
      const parsed = parseProviderInput(prompt);
      if (await handleTerminalInput({ parsed, raw: prompt, rl, state, desktopUrl, color })) {
        return;
      }
      appendTranscript(state, "user", prompt);
      await sendPrompt({
        prompt: promptWithStagedContext(parsed.prompt || prompt, parsed.mentions, state),
        model: state.model,
        reasoningEffort: state.reasoningEffort,
        tokenMode: state.tokenMode,
        projectId: state.projectId,
        desktopUrl,
        history: state.history,
        color,
        agentSession: state.agentSession,
        terminalState: state,
        onModelSelected: (model) => {
          state.model = model;
          state.agentSession.threadId = "";
        }
      });
    } finally {
      if (!rl.closed) {
        rl.setPrompt(interactivePromptForModel(state.model, output.columns || 100, color));
        rl.prompt();
      }
    }
  }

  const handleInterrupt = () => {
    const now = Date.now();
    if (now - state.lastInterruptAt < 75) return;
    state.lastInterruptAt = now;
    if (cancelActiveProcess(state)) {
      output.write(`\r\n${ansi("■", 33, color)} Cancelling the current Vibyra Agent task...\r\n`);
      return;
    }
    output.write("\r\n");
    rl.prompt();
  };

  rl.on("SIGINT", handleInterrupt);
  process.on("SIGINT", handleInterrupt);
  const handleTerminate = () => terminateTerminal(state, rl);
  process.on("SIGTERM", handleTerminate);

  rl.on("close", () => {
    process.off("SIGINT", handleInterrupt);
    process.off("SIGTERM", handleTerminate);
    output.write("\r\n");
    process.exit(0);
  });
}

async function sendPrompt(options) {
  if (isAutoModel(options.model)) {
    await sendAutoPrompt(options);
    return;
  }
  await executePrompt(options);
}

async function executePrompt(options) {
  if (!process.env.VIBYRA_AGENT_ENGINE) {
    writeSystemLine(
      options.terminalState,
      options.model,
      "Vibyra Agent's tool engine is unavailable. This terminal will not fall back to chat-only mode.",
      options.color,
      true
    );
    return;
  }
  await sendAgentPrompt(options);
}

async function sendAutoPrompt(options) {
  output.write(`\r\n${formatAutoMatchingStatus(options.color)}\r\n`);
  try {
    const routing = await resolveAutoTerminalModel({
      desktopUrl: options.desktopUrl,
      prompt: options.prompt
    });
    const model = autoRoutingModel(routing);
    if (isAutoModel(model)) throw new Error("Auto did not return a usable terminal model.");

    output.write(`\r\n${formatAutoRoutingStatus(routing, options.color)}\r\n`);
    if (!autoRoutingUsesAgent(routing)) {
      output.write(`${formatAutoChatTransitionStatus(model, options.color)}\r\n`);
      await sendFastResponsesPrompt({ ...options, model });
      return;
    }
    await persistAutoTerminalModel({
      desktopUrl: options.desktopUrl,
      terminalId: process.env.VIBYRA_TERMINAL_ID,
      model
    });
    options.agentSession.threadId = "";
    options.onModelSelected?.(model);
    output.write(`${formatAutoTransitionStatus(model, options.color)}\r\n`);
    await executePrompt({ ...options, model });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Auto could not route this prompt.";
    output.write(`\r\n${ansi("⚠", 31, options.color)} ${message}\r\n\r\n`);
  }
}

export async function resolveAutoTerminalModel({ desktopUrl, prompt, fetchImpl = fetch }) {
  const response = await fetchImpl(`${normalizeDesktopUrl(desktopUrl)}/desktop/chat/route`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ prompt })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.ok === false) throw chatError(response, result);
  return result;
}

export async function persistAutoTerminalModel({ desktopUrl, terminalId, model, fetchImpl = fetch }) {
  const id = String(terminalId || "").trim();
  if (!id) throw new Error("Auto could not identify this terminal session.");
  const response = await fetchImpl(
    `${normalizeDesktopUrl(desktopUrl)}/desktop/pty-terminals/${encodeURIComponent(id)}/model`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model })
    }
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.ok === false) {
    throw new Error(result?.error || result?.message || "Auto could not switch this terminal to the selected model.");
  }
  return result?.session || null;
}

async function sendFastResponsesPrompt({ prompt, model, desktopUrl, history, color, terminalState }) {
  output.write(`\r\n${formatProviderWorkingStatus(model, color)}\r\n`);
  try {
    const response = await fetch(`${desktopUrl}/desktop/v1/responses`, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        Authorization: `Bearer ${process.env.VIBYRA_TERMINAL_GATEWAY_TOKEN || ""}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: [{
          role: "user",
          content: [{ type: "input_text", text: prompt }]
        }],
        max_output_tokens: 800,
        store: false,
        stream: true
      })
    });
    const body = await response.text();
    if (!response.ok) {
      const result = JSON.parse(body || "{}");
      throw chatError(response, result);
    }
    const reply = responsesOutputText(body);
    if (!reply) throw new Error("Vibyra received an empty model response.");
    history.push({ role: "user", text: prompt }, { role: "assistant", text: reply });
    if (terminalState) appendTranscript(terminalState, "assistant", reply);
    trimHistory(history);
    output.write(`\r\n${formatAssistantReply(reply, model, color)}\r\n\r\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vibyra AI could not complete this prompt.";
    output.write(`\r\n${ansi("⚠", 31, color)} ${message}\r\n\r\n`);
  }
}

export function responsesOutputText(streamBody) {
  let reply = "";
  let completed = "";
  for (const line of String(streamBody || "").split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const value = line.slice(5).trim();
    if (!value || value === "[DONE]") continue;
    let event;
    try {
      event = JSON.parse(value);
    } catch {
      continue;
    }
    if (event?.type === "response.output_text.delta") {
      reply += String(event.delta || "");
    }
    if (event?.type === "response.completed") {
      completed = completedResponseText(event.response);
    }
  }
  return (reply || completed).trim();
}

function completedResponseText(response) {
  const parts = [];
  for (const item of Array.isArray(response?.output) ? response.output : []) {
    if (item?.type !== "message") continue;
    for (const content of Array.isArray(item.content) ? item.content : []) {
      if (content?.type === "output_text" && content.text) parts.push(String(content.text));
    }
  }
  return parts.join("\n");
}

async function sendAgentPrompt({ prompt, model, reasoningEffort, color, agentSession, history, terminalState }) {
  const engine = process.env.VIBYRA_AGENT_ENGINE;
  const args = vibyraAgentArgs({
    desktopUrl: normalizeDesktopUrl(process.env.VIBYRA_DESKTOP_URL, process.env.VIBYRA_DESKTOP_PORT),
    model,
    permissionMode: process.env.VIBYRA_PERMISSION_MODE,
    sandboxMode: process.env.VIBYRA_SANDBOX_MODE,
    roleInstructions: process.env.VIBYRA_TEAM_ROLE_INSTRUCTIONS,
    prompt,
    reasoningEffort,
    threadId: agentSession.threadId
  });
  const startedAt = Date.now();
  const progress = startTaskProgress(model, color, startedAt);
  output.write(`\r\n${formatProviderWorkingStatus(model, color)}\r\n`);
  let finalMessage = "";
  let agentError = "";
  let pending = "";
  let stderr = "";
  let cancelled = false;
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(engine, args, {
        cwd: process.cwd(),
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true
      });
      if (terminalState) {
        terminalState.activeProcess = child;
        terminalState.cancellationRequested = false;
      }
      child.stdin.end(prompt);
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        pending += chunk;
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() || "";
        for (const line of lines) {
          const event = parseAgentEvent(line);
          if (!event) continue;
          if (event.type === "thread.started" && event.thread_id) agentSession.threadId = event.thread_id;
          if (event.type === "error" && event.message) agentError = String(event.message);
          if (event.type === "turn.failed" && event.error?.message) agentError = String(event.error.message);
          const rendered = renderAgentEvent(event, color, model);
          if (rendered) output.write(`${rendered}\r\n`);
          if (event.type === "item.completed" && event.item?.type === "agent_message") {
            finalMessage = String(event.item.text || "").trim();
          }
        }
      });
      child.stderr.on("data", (chunk) => {
        stderr = `${stderr}${chunk}`.slice(-4000);
      });
      child.on("error", reject);
      child.on("close", (code) => {
        cancelled = Boolean(terminalState?.cancellationRequested);
        if (terminalState?.activeProcess === child) terminalState.activeProcess = null;
        if (pending.trim()) {
          const event = parseAgentEvent(pending);
          if (event?.type === "error" && event.message) agentError = String(event.message);
          if (event?.type === "turn.failed" && event.error?.message) agentError = String(event.error.message);
          const rendered = event ? renderAgentEvent(event, color, model) : "";
          if (rendered) output.write(`${rendered}\r\n`);
          if (event?.type === "item.completed" && event.item?.type === "agent_message") {
            finalMessage = String(event.item.text || "").trim();
          }
        }
        if (code === 0 || cancelled) resolve();
        else reject(new Error(agentError || cleanAgentError(stderr) || `Vibyra agent exited with code ${code}.`));
      });
    });
    if (cancelled) {
      output.write(`\r\n${ansi("■", 33, color)} Task cancelled. The terminal is ready for another command.\r\n\r\n`);
      return;
    }
    if (finalMessage) {
      history?.push({ role: "user", text: prompt }, { role: "assistant", text: finalMessage });
      if (history) trimHistory(history);
      if (terminalState) appendTranscript(terminalState, "assistant", finalMessage);
      output.write(`\r\n${formatAssistantReply(finalMessage, model, color)}\r\n`);
    }
    output.write(`${ansi("✓", 32, color)} ${taskCompletionText(Date.now() - startedAt)}\r\n`);
    output.write("\r\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vibyra could not complete this task.";
    output.write(`\r\n${ansi("⚠", 31, color)} ${message}\r\n\r\n`);
  } finally {
    progress.stop();
    if (terminalState) {
      terminalState.activeProcess = null;
      terminalState.cancellationRequested = false;
    }
  }
}

export function vibyraAgentArgs({ desktopUrl, model = "auto", permissionMode = "standard", sandboxMode = "", roleInstructions = "", prompt, reasoningEffort = "medium", threadId = "" }) {
  const instructionsFile = String(process.env.VIBYRA_AGENT_INSTRUCTIONS_FILE || "").trim();
  const provider = [
    "-c", 'model_provider="vibyra"',
    "-c", 'model_providers.vibyra.name="Vibyra Agent"',
    "-c", `model_providers.vibyra.base_url="${normalizeDesktopUrl(desktopUrl)}/desktop/v1"`,
    "-c", 'model_providers.vibyra.wire_api="responses"',
    "-c", 'model_providers.vibyra.env_key="VIBYRA_TERMINAL_GATEWAY_TOKEN"',
    "-c", "model_providers.vibyra.request_max_retries=1",
    "-c", "model_providers.vibyra.stream_max_retries=1",
    "-c", 'shell_environment_policy.exclude=["VIBYRA_TERMINAL_GATEWAY_TOKEN"]',
    "-c", 'approval_policy="never"'
  ];
  if (instructionsFile) {
    provider.push("-c", `model_instructions_file=${JSON.stringify(instructionsFile)}`);
  }
  provider.push("-c", `developer_instructions=${JSON.stringify([
    vibyraAgentRuntimeIdentity(model),
    String(roleInstructions || "").trim()
  ].filter(Boolean).join("\n\n"))}`);
  const effort = normalizeReasoningEffort(reasoningEffort);
  if (effort !== "default" && effort !== "none") provider.push("-c", `model_reasoning_effort="${effort}"`);
  const readOnly = String(sandboxMode || "").trim().toLowerCase() === "read-only";
  const access = readOnly
    ? threadId
      ? ["-c", 'sandbox_mode="read-only"']
      : ["--sandbox", "read-only"]
    : normalizePermissionMode(permissionMode) === "full"
    ? ["--dangerously-bypass-approvals-and-sandbox"]
    : threadId ? [] : ["--sandbox", "workspace-write"];
  const shared = [
    "--json",
    "--ignore-user-config",
    "--skip-git-repo-check",
    "--model", String(model || "auto"),
    ...provider,
    ...access
  ];
  return threadId
    ? ["exec", "resume", ...shared, threadId, "-"]
    : ["exec", "--color", "never", ...shared, "-"];
}

export function vibyraAgentRuntimeIdentity(model) {
  const selectedModel = String(model || "auto").trim() || "auto";
  return [
    "Vibyra Agent runtime identity:",
    `- Active inference model: ${selectedModel}`,
    "- API route: OpenRouter",
    "- User-facing runtime: Vibyra Agent",
    "- Codex is only the local file/shell tool orchestrator. Do not identify as Codex, Codex CLI, OpenAI, or a provider-native CLI.",
    `- If asked which model you are, answer that the active model is ${selectedModel}, running through OpenRouter via Vibyra Agent.`
  ].join("\n");
}

export function parseAgentEvent(line) {
  try {
    const event = JSON.parse(String(line || ""));
    return event && typeof event === "object" ? event : null;
  } catch {
    return null;
  }
}

export function renderAgentEvent(event, color = true, modelKey = "auto") {
  const item = event?.item || {};
  const info = providerInfoForModel(modelKey);
  const tokens = providerTokens(info);
  const command = compactCommand(item.command);
  if (event?.type === "item.started" && item.type === "command_execution") {
    return `${ansi(tokens.activity, info.color, color)} ${ansi("shell", "1;37", color)}  ${ansi(command, "2", color)}`;
  }
  if (event?.type === "item.completed" && item.type === "command_execution") {
    const outputText = String(item.aggregated_output || "").trim();
    const status = Number(item.exit_code) === 0 ? ansi("✓", 32, color) : ansi("⚠", 31, color);
    const result = outputText ? lastUsefulLine(outputText) : command;
    return `${status} ${ansi("shell", "1;37", color)}  ${result}`;
  }
  if (event?.type === "item.completed" && item.type === "file_change") {
    return `${ansi(tokens.result, 32, color)} ${ansi("files", "1;37", color)}  workspace updated`;
  }
  return "";
}

function startTaskProgress(model, color, startedAt) {
  const info = providerInfoForModel(model);
  output.write(`\x1b]0;⠋ ${info.name} via Vibyra Agent\x07`);
  let interval = null;
  const first = setTimeout(() => {
    output.write(`\r\n${ansi(providerTokens(info).activity, info.color, color)} ${providerProgressText(info, Date.now() - startedAt)}\r\n`);
    interval = setInterval(() => {
      output.write(`${ansi(providerTokens(info).activity, info.color, color)} ${providerProgressText(info, Date.now() - startedAt)}\r\n`);
    }, 60_000);
    interval.unref?.();
  }, 30_000);
  first.unref?.();
  return {
    stop() {
      clearTimeout(first);
      clearInterval(interval);
      output.write("\x1b]0;Vibyra Agent ready\x07");
    }
  };
}

function compactCommand(value) {
  const command = String(value || "").replace(/\s+/g, " ").trim();
  return command.length > 120 ? `${command.slice(0, 117)}...` : command || "workspace command";
}

function lastUsefulLine(value) {
  const lines = String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const line = lines.at(-1) || "Command completed";
  return line.length > 140 ? `${line.slice(0, 137)}...` : line;
}

function cleanAgentError(value) {
  return String(value || "")
    .replace(/\x1b\[[0-?]*[ -/]*[\@-~]/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1) || "";
}

async function handleTerminalInput({ parsed, raw, rl, state, desktopUrl, color }) {
  const profile = terminalCommandProfile(state.model);
  if (parsed.kind === "empty") return true;
  if (parsed.kind === "shell") {
    await runProviderShellCommand(parsed.command, state, color);
    return true;
  }
  if (parsed.kind !== "slash") return false;
  if (!commandIsKnown(profile, parsed.command)) {
    writeSystemLine(state, state.model, `Unknown Vibyra Agent command: ${parsed.command}. Use /help.`, color, true);
    return true;
  }
  if (commandIsLocal(parsed.command) || parsed.command === "/") {
    return handleLocalProviderCommand({ command: parsed.command, args: parsed.args, profile, rl, state, color });
  }
  const prompt = providerCommandPrompt(parsed.command, parsed.args);
  appendTranscript(state, "user", raw);
  await sendPrompt({
    prompt: promptWithStagedContext(prompt, [], state),
    model: state.model,
    reasoningEffort: state.reasoningEffort,
    tokenMode: state.tokenMode,
    projectId: state.projectId,
    desktopUrl,
    history: state.history,
    color,
    agentSession: state.agentSession,
    terminalState: state,
    onModelSelected: (model) => {
      state.model = model;
      state.agentSession.threadId = "";
    }
  });
  return true;
}

async function handleLocalProviderCommand({ command, args, profile, rl, state, color }) {
  if (command === "/" || command === "/help") {
    writeSystemLine(state, state.model, `${profile.label} commands\n${providerCommandHelp(profile)}`, color);
    return true;
  }
  if (command === "/exit") {
    rl.close();
    return true;
  }
  if (command === "/clear") {
    output.write("\x1Bc");
    printIntro({
      model: state.model,
      reasoningEffort: state.reasoningEffort,
      cwd: process.cwd(),
      permissionMode: state.permissionMode,
      tokenMode: state.tokenMode,
      color
    });
    return true;
  }
  if (command === "/new") {
    resetTerminalSession(state, true);
    writeSystemLine(state, state.model, "Started a new Vibyra Agent thread.", color);
    return true;
  }
  if (command === "/resume") {
    const status = state.agentSession.threadId
      ? `Persistent thread: ${state.agentSession.threadId}\nEvery new prompt resumes it automatically.`
      : "No persistent thread exists yet. The first completed agent task creates one.";
    writeSystemLine(state, state.model, status, color);
    return true;
  }
  if (command === "/model") {
    const info = providerInfoForModel(state.model);
    const suffix = args ? "\nChange models from the terminal model picker so routing and billing stay synchronized." : "";
    writeSystemLine(state, state.model, `${info.name} via Vibyra Agent\nmodel: ${state.model}${suffix}`, color);
    return true;
  }
  if (command === "/effort") {
    if (!args) return writeUsage(state, state.model, "/effort default|low|medium|high|xhigh", color);
    const requested = args.trim().toLowerCase();
    const next = normalizeReasoningEffort(requested);
    if (next !== requested || next === "none") {
      return writeUsage(state, state.model, "/effort default|low|medium|high|xhigh", color);
    }
    state.reasoningEffort = next;
    state.agentSession.threadId = "";
    writeSystemLine(state, state.model, `Reasoning effort set to ${next}.`, color);
    return true;
  }
  if (command === "/status") {
    writeSystemLine(state, state.model, terminalStatus(state, profile), color);
    return true;
  }
  if (command === "/identity") {
    const info = providerInfoForModel(state.model);
    writeSystemLine(
      state,
      state.model,
      `${info.name} model terminal\nmodel: ${state.model}\nruntime: Vibyra Agent\nroute: OpenRouter\nownership: Vibyra-owned tools and terminal UI`,
      color
    );
    return true;
  }
  if (command === "/pwd") {
    writeSystemLine(state, state.model, displayDirectory(process.cwd()), color);
    return true;
  }
  if (command === "/files") {
    try {
      const path = args ? resolveTerminalPath(args, state) : process.cwd();
      writeSystemLine(state, state.model, `${displayDirectory(path)}\n${listWorkspaceEntries(path)}`, color);
    } catch (error) {
      writeSystemLine(state, state.model, error instanceof Error ? error.message : "Could not list workspace files.", color, true);
    }
    return true;
  }
  if (command === "/git") {
    try {
      writeSystemLine(state, state.model, await readWorkspaceGitStatus(process.cwd()), color);
    } catch (error) {
      writeSystemLine(state, state.model, error instanceof Error ? error.message : "Could not read Git status.", color, true);
    }
    return true;
  }
  if (command === "/history") {
    writeSystemLine(state, state.model, formatTranscriptHistory(state.transcript, args || 12), color);
    return true;
  }
  if (command === "/unstage") {
    const result = removeStagedContext(state.stagedContexts, args);
    const message = result.removed
      ? `${result.path ? `Removed staged context: ${displayDirectory(result.path)}` : "Cleared staged context."}\nremaining: ${result.remaining}`
      : `Staged context not found: ${args || "all"}`;
    writeSystemLine(state, state.model, message, color, !result.removed);
    return true;
  }
  if (["/copy", "/export"].includes(command)) {
    const latestAssistant = [...state.transcript].reverse().find((item) => item.role === "assistant")?.text || "";
    const transcript = state.transcript.map((item) => `${item.role}: ${item.text}`).join("\n\n");
    if (command === "/copy") {
      const value = latestAssistant || transcript;
      output.write(`\x1b]52;c;${Buffer.from(value).toString("base64")}\x07`);
      writeSystemLine(state, state.model, latestAssistant ? "Latest response copied to the terminal clipboard." : "Transcript copied to the terminal clipboard.", color);
    } else {
      const path = exportTranscript(transcript, profile.key);
      writeSystemLine(state, state.model, `Transcript exported to ${path}.`, color);
    }
    return true;
  }
  if (command === "/context" || command === "/cd") {
    return handleContextCommand(command, args, state, color);
  }
  if (command === "/permissions") {
    writeSystemLine(state, state.model, permissionStatus(state), color);
    return true;
  }
  if (command === "/usage") {
    const billing = terminalBillingLabel(state.tokenMode);
    writeSystemLine(state, state.model, `billing: ${billing}\nmodel: ${state.model}\ntranscript entries: ${state.transcript.length}\nlive credit totals are shown in Vibyra Billing`, color);
    return true;
  }
  if (command === "/shell") {
    writeSystemLine(state, state.model, shellHelp(state), color);
    return true;
  }
  if (command === "/stop") {
    const stopped = cancelActiveProcess(state);
    writeSystemLine(state, state.model, stopped ? "Cancellation requested." : "No task is currently running.", color);
    return true;
  }
  return true;
}

async function runProviderShellCommand(command, state, color) {
  const value = String(command || "").trim();
  if (!value) {
    writeSystemLine(state, state.model, "Shell syntax expects a command after !.", color, true);
    return;
  }
  if (state.permissionMode !== "full" && !STANDARD_SHELL_COMMANDS.has(value)) {
    writeSystemLine(state, state.model, `Command requires Full access: ${value}\n${shellHelp(state)}`, color, true);
    return;
  }
  const info = providerInfoForModel(state.model);
  const tokens = providerTokens(info);
  output.write(`\r\n${ansi(tokens.activity, info.color, color)} shell  ${value}\r\n`);
  appendTranscript(state, "shell", value);
  const result = await executeShell(value, state);
  const marker = result.code === 0 ? tokens.result : "⚠";
  const text = result.output || "Command finished with no output.";
  output.write(`${ansi(marker, result.code === 0 ? info.color : 31, color)} ${text.replace(/\r?\n/g, "\r\n  ")}\r\n\r\n`);
  appendTranscript(state, "shell-output", text);
}

function executeShell(command, state) {
  return new Promise((resolveResult) => {
    const shell = shellCommandParts(command);
    const child = spawn(shell.command, shell.args, {
      cwd: process.cwd(),
      env: shellCommandEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    state.activeProcess = child;
    state.cancellationRequested = false;
    let result = "";
    const append = (chunk) => {
      result = `${result}${chunk}`.slice(-200_000);
    };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    const timer = setTimeout(() => child.kill("SIGTERM"), 20_000);
    child.on("error", (error) => {
      clearTimeout(timer);
      if (state.activeProcess === child) state.activeProcess = null;
      resolveResult({ code: 1, output: error.message });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (state.activeProcess === child) state.activeProcess = null;
      state.cancellationRequested = false;
      resolveResult({
        code: Number.isInteger(code) ? code : 1,
        output: `${result.trim()}${signal ? `\nProcess stopped by ${signal}.` : ""}`.trim()
      });
    });
  });
}

function handleContextCommand(command, args, state, color) {
  if (!args) {
    const staged = state.stagedContexts.length ? state.stagedContexts.join("\n") : "No additional paths staged.";
    writeSystemLine(state, state.model, `directory: ${displayDirectory(process.cwd())}\nstaged context:\n${staged}`, color);
    return true;
  }
  let path;
  try {
    path = resolveTerminalPath(args, state);
  } catch (error) {
    writeSystemLine(state, state.model, error instanceof Error ? error.message : "Path is outside this workspace.", color, true);
    return true;
  }
  if (!existsSync(path)) {
    writeSystemLine(state, state.model, `Path not found: ${args}`, color, true);
    return true;
  }
  if (command === "/cd") {
    if (!statSync(path).isDirectory()) {
      writeSystemLine(state, state.model, `Not a directory: ${args}`, color, true);
      return true;
    }
    process.chdir(path);
    state.agentSession.threadId = "";
    writeSystemLine(state, state.model, `Changed directory to ${displayDirectory(path)}.`, color);
    return true;
  }
  if (!state.stagedContexts.includes(path)) state.stagedContexts.push(path);
  state.stagedContexts = state.stagedContexts.slice(-12);
  writeSystemLine(state, state.model, `Staged context: ${displayDirectory(path)}`, color);
  return true;
}

function promptWithStagedContext(prompt, mentions = [], state) {
  const paths = [...state.stagedContexts];
  for (const mention of mentions || []) {
    try {
      const path = resolveTerminalPath(mention, state);
      if (existsSync(path) && !paths.includes(path)) paths.push(path);
    } catch {}
  }
  if (!paths.length) return prompt;
  return `${prompt}\n\nVibyra Agent file context:\n${paths.slice(-12).map((path) => `- ${path}`).join("\n")}`;
}

function resolveTerminalPath(value, state) {
  try {
    return resolveWorkspacePath(value, {
      cwd: process.cwd(),
      workspaceRoot: state?.workspaceRoot,
      permissionMode: state?.permissionMode
    });
  } catch {
    throw new Error(`Standard access is limited to ${displayDirectory(state?.workspaceRoot)}.`);
  }
}

function terminalStatus(state, profile) {
  const info = providerInfoForModel(state.model);
  return [
    `${info.name} via ${profile.label}`,
    "runtime: Vibyra-owned API model terminal",
    "engine: persistent billed Responses tool runtime",
    `model: ${state.model}`,
    `effort: ${state.reasoningEffort}`,
    `directory: ${displayDirectory(process.cwd())}`,
    `access: ${accessLabel(state.permissionMode)}`,
    `thread: ${state.agentSession.threadId || "not started"} (resumed automatically)`,
    `activity: ${state.activeProcess ? "working" : "ready"}`,
    `staged paths: ${state.stagedContexts.length}`
  ].join("\n");
}

function permissionStatus(state) {
  return state.permissionMode === "full"
    ? "permission mode: Full access\nshell: unrestricted\nagent approvals: bypassed\nworkspace edits: allowed"
    : `permission mode: Standard\nshell allowlist: ${Array.from(STANDARD_SHELL_COMMANDS).join(", ")}\nagent sandbox: workspace-write`;
}

function accessLabel(permissionMode) {
  return normalizePermissionMode(permissionMode) === "full"
    ? "Full · unrestricted"
    : "Standard · workspace-write";
}

function shellHelp(state) {
  return state.permissionMode === "full"
    ? "Use !<command> to run a shell command with Full access."
    : `Use !<command> for allowed commands: ${Array.from(STANDARD_SHELL_COMMANDS).join(", ")}. Enable Full access from terminal settings for other commands.`;
}

function cancelActiveProcess(state) {
  const child = state?.activeProcess;
  if (!child || child.exitCode !== null) return false;
  state.cancellationRequested = true;
  child.kill("SIGINT");
  const timer = setTimeout(() => {
    if (state.activeProcess === child && child.exitCode === null) child.kill("SIGTERM");
  }, 1500);
  timer.unref?.();
  return true;
}

function terminateTerminal(state, rl) {
  const child = state?.activeProcess;
  if (!child || child.exitCode !== null) {
    rl.close();
    return;
  }
  let forceTimer = null;
  const finish = () => {
    clearTimeout(forceTimer);
    if (!rl.closed) rl.close();
  };
  child.once("close", finish);
  try { child.kill("SIGTERM"); } catch { finish(); return; }
  forceTimer = setTimeout(() => {
    if (child.exitCode === null) child.kill("SIGKILL");
  }, 1500);
  forceTimer.unref?.();
}

function shellCommandParts(command) {
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", command]
    };
  }
  return {
    command: process.env.SHELL || "/bin/bash",
    args: ["-lc", command]
  };
}

function shellCommandEnvironment() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      key === "VIBYRA_TERMINAL_GATEWAY_TOKEN"
      || /(?:^|_)(?:API_KEY|ACCESS_KEY_ID|SECRET_ACCESS_KEY|AUTH_TOKEN|ACCESS_TOKEN|SESSION_TOKEN|BEARER_TOKEN|CLIENT_SECRET|PRIVATE_KEY|PASSWORD|TOKEN)$/i.test(key)
    ) {
      delete env[key];
    }
  }
  return env;
}

function resetTerminalSession(state, clearTranscript) {
  state.history.length = 0;
  state.agentSession.threadId = "";
  if (clearTranscript) state.transcript.length = 0;
}

function writeSystemLine(state, model, message, color, warning = false) {
  const info = providerInfoForModel(model);
  const marker = warning ? "⚠" : providerTokens(info).assistant;
  const code = warning ? 31 : info.color;
  const lines = renderTerminalMarkdown(message, color).split(/\r?\n/);
  output.write(`\r\n${ansi(marker, code, color)} ${lines.join("\r\n  ")}\r\n\r\n`);
  appendTranscript(state, warning ? "error" : "system", message);
  return true;
}

function writeUsage(state, model, usage, color) {
  return writeSystemLine(state, model, `Usage: ${usage}`, color, true);
}

function appendTranscript(state, role, text) {
  state.transcript.push({ role, text: String(text || "").trim() });
  if (state.transcript.length > MAX_TRANSCRIPT) state.transcript.splice(0, state.transcript.length - MAX_TRANSCRIPT);
}

function exportTranscript(transcript, provider) {
  const directory = join(homedir(), ".vibyra-agent", "terminal-exports");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `${provider}-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`);
  writeFileSync(path, `${transcript}\n`, { mode: 0o600 });
  return path;
}

function printIntro({ model, reasoningEffort, cwd, permissionMode, tokenMode, color }) {
  output.write(`${renderIntroForModel({
    modelKey: model,
    reasoningEffort,
    cwd,
    columns: output.columns || 100,
    color,
    permissionMode,
    tokenMode
  })}\r\n`);
}

function displayDirectory(cwd) {
  const directory = String(cwd || process.cwd());
  const home = homedir();
  if (directory === home) return "~";
  if (directory.startsWith(`${home}/`) || directory.startsWith(`${home}\\`)) {
    return `~/${directory.slice(home.length + 1).replace(/\\/g, "/")}`;
  }
  return directory;
}

function trimHistory(history) {
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
}

function displayModel(modelKey) {
  return modelKey || "auto";
}

function providerProgressText(info, elapsedMs) {
  const verb = info.theme?.activity?.verb || "working";
  return `${info.name} is ${verb} · ${formatElapsedDuration(elapsedMs)}`;
}

function boxLine(value, inner, colorCode, color) {
  const text = truncateVisible(value, inner - 2);
  const padding = inner - visibleLength(text);
  return `${ansi("│", colorCode, color)} ${text}${" ".repeat(Math.max(0, padding - 1))}${ansi("│", colorCode, color)}`;
}

function center(value, width) {
  const length = visibleLength(value);
  if (length >= width) return truncateVisible(value, width);
  const left = Math.floor((width - length) / 2);
  return `${" ".repeat(left)}${value}`;
}

function truncateVisible(value, width) {
  let result = "";
  let visible = 0;
  for (let index = 0; index < String(value).length; index += 1) {
    if (value[index] === "\x1b") {
      const end = String(value).indexOf("m", index);
      if (end === -1) break;
      result += String(value).slice(index, end + 1);
      index = end;
      continue;
    }
    if (visible >= width) break;
    result += value[index];
    visible += 1;
  }
  return result;
}

function visibleLength(value) {
  return String(value).replace(/\x1b\[[0-9;]*m/g, "").length;
}

function ansi(value, colorCode, enabled) {
  return enabled ? `\x1b[${colorCode}m${value}\x1b[0m` : value;
}

function ansiForeground(value, colorCode, enabled) {
  const text = String(value || "");
  if (!text || !enabled || !colorCode) return text;
  return `\x1b[49m\x1b[${colorCode}m${text}\x1b[39m\x1b[49m`;
}

function normalizeReasoningEffort(value) {
  const effort = String(value || "medium").trim().toLowerCase();
  return ["default", "low", "medium", "high", "xhigh", "none"].includes(effort) ? effort : "medium";
}

function normalizeTokenMode(value) {
  const mode = String(value || "vibyra").trim().toLowerCase();
  return ["vibyra", "provider"].includes(mode) ? mode : "vibyra";
}

function terminalBillingLabel(tokenMode) {
  if (tokenMode === "provider") return "connected provider account";
  return "Vibyra tokens";
}

function normalizePermissionMode(value) {
  return String(value || "").trim().toLowerCase() === "full" ? "full" : "standard";
}

export function normalizeDesktopUrl(url, port) {
  const explicit = String(url || "").trim();
  if (explicit) {
    try {
      const parsed = new URL(explicit);
      parsed.pathname = parsed.pathname.replace(/\/desktop\/?$/, "").replace(/\/+$/, "");
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString().replace(/\/+$/, "");
    } catch {
      return explicit.replace(/\/desktop\/?$/, "").replace(/\/+$/, "");
    }
  }
  const nextPort = Number.parseInt(String(port || "4317"), 10);
  return `http://127.0.0.1:${Number.isFinite(nextPort) ? nextPort : 4317}`;
}

function chatError(response, result) {
  const error = new Error(String(result?.error || result?.message || `Vibyra AI returned ${response.status}.`));
  error.status = response.status;
  return error;
}

function isMainModule() {
  return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
}
