import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";

const MAX_HISTORY = 8;
const OFFICIAL_CLI_PROVIDERS = new Set(["anthropic", "claude", "openai", "google"]);
const CLAUDE_ORANGE = "38;2;255;155;106";
const CLAUDE_ASCII_ART = [
  " ▐▛███▜▌",
  "▝▜█████▛▘",
  "  ▘▘ ▝▝"
];

const PROVIDERS = {
  "x-ai": { name: "xAI", mark: "xAI", prompt: "xai", color: 36, tip: "Ask Grok to compare options or challenge assumptions." },
  xai: { name: "xAI", mark: "xAI", prompt: "xai", color: 36, tip: "Ask Grok to compare options or challenge assumptions." },
  deepseek: { name: "DeepSeek", mark: "DS", prompt: "deepseek", color: 34, tip: "Ask DeepSeek for coding, debugging, or reasoning help." },
  qwen: { name: "Qwen", mark: "QW", prompt: "qwen", color: 35, tip: "Ask Qwen to inspect code paths or draft implementation steps." },
  mistralai: { name: "Mistral", mark: "MI", prompt: "mistral", color: 33, tip: "Ask Mistral for concise edits, summaries, or code review." },
  mistral: { name: "Mistral", mark: "MI", prompt: "mistral", color: 33, tip: "Ask Mistral for concise edits, summaries, or code review." },
  meta: { name: "Meta", mark: "ME", prompt: "meta", color: 34, tip: "Ask Llama models for fast drafts and broad code explanations." },
  "meta-llama": { name: "Meta", mark: "ME", prompt: "meta", color: 34, tip: "Ask Llama models for fast drafts and broad code explanations." },
  microsoft: { name: "Microsoft", mark: "MS", prompt: "microsoft", color: 36, tip: "Ask Microsoft models for structured, work-focused answers." },
  cohere: { name: "Cohere", mark: "CO", prompt: "cohere", color: 33, tip: "Ask Cohere for retrieval-heavy summaries and grounded rewrites." },
  perplexity: { name: "Perplexity", mark: "PX", prompt: "perplexity", color: 36, tip: "Ask Perplexity-style models for source-aware synthesis." },
  moonshotai: { name: "Moonshot", mark: "KS", prompt: "moonshot", color: 35, tip: "Ask Kimi models for long-context analysis and planning." },
  moonshot: { name: "Moonshot", mark: "KS", prompt: "moonshot", color: 35, tip: "Ask Kimi models for long-context analysis and planning." },
  zhipuai: { name: "Zhipu", mark: "GLM", prompt: "zhipu", color: 35, tip: "Ask GLM models for structured reasoning and implementation notes." },
  zhipu: { name: "Zhipu", mark: "GLM", prompt: "zhipu", color: 35, tip: "Ask GLM models for structured reasoning and implementation notes." },
  "z-ai": { name: "Zhipu", mark: "GLM", prompt: "zhipu", color: 35, tip: "Ask GLM models for structured reasoning and implementation notes." },
  alibaba: { name: "Alibaba", mark: "ALI", prompt: "alibaba", color: 33, tip: "Ask Alibaba models for pragmatic coding and product copy." },
  tencent: { name: "Tencent", mark: "TC", prompt: "tencent", color: 34, tip: "Ask Tencent models for compact technical answers." },
  baidu: { name: "Baidu", mark: "BD", prompt: "baidu", color: 34, tip: "Ask Baidu models for implementation notes and translation help." },
  bytedance: { name: "ByteDance", mark: "BDY", prompt: "bytedance", color: 31, tip: "Ask ByteDance models for quick code and content iterations." },
  "bytedance-seed": { name: "ByteDance", mark: "BDY", prompt: "bytedance", color: 31, tip: "Ask ByteDance models for quick code and content iterations." },
  xiaomi: { name: "Xiaomi", mark: "MI", prompt: "xiaomi", color: 33, tip: "Ask Xiaomi models for concise implementation guidance." },
  nvidia: { name: "NVIDIA", mark: "NV", prompt: "nvidia", color: 32, tip: "Ask NVIDIA models for technical analysis and optimization ideas." },
  minimax: { name: "MiniMax", mark: "MM", prompt: "minimax", color: 35, tip: "Ask MiniMax models for creative drafts and structured answers." },
  amazon: { name: "Amazon", mark: "AMZ", prompt: "amazon", color: 33, tip: "Ask Amazon models for practical implementation and product workflows." },
  ai21: { name: "AI21", mark: "AI21", prompt: "ai21", color: 36, tip: "Ask AI21 models for grounded writing, summaries, and technical drafts." },
  ai21labs: { name: "AI21", mark: "AI21", prompt: "ai21", color: 36, tip: "Ask AI21 models for grounded writing, summaries, and technical drafts." },
  ibm: { name: "IBM", mark: "IBM", prompt: "ibm", color: 34, tip: "Ask IBM models for enterprise-style analysis and code guidance." },
  "ibm-granite": { name: "IBM", mark: "IBM", prompt: "ibm", color: 34, tip: "Ask IBM models for enterprise-style analysis and code guidance." },
  groq: { name: "Groq", mark: "GRQ", prompt: "groq", color: 36, tip: "Ask Groq-hosted models for fast coding and reasoning iterations." },
  together: { name: "Together AI", mark: "TGA", prompt: "together", color: 35, tip: "Ask Together-hosted models for open-model coding and drafting." },
  "together-ai": { name: "Together AI", mark: "TGA", prompt: "together", color: 35, tip: "Ask Together-hosted models for open-model coding and drafting." },
  fireworks: { name: "Fireworks", mark: "FW", prompt: "fireworks", color: 31, tip: "Ask Fireworks-hosted models for fast implementation notes." },
  "fireworks-ai": { name: "Fireworks", mark: "FW", prompt: "fireworks", color: 31, tip: "Ask Fireworks-hosted models for fast implementation notes." },
  liquid: { name: "Liquid AI", mark: "LQ", prompt: "liquid", color: 36, tip: "Ask Liquid models for concise technical reasoning." },
  "liquid-ai": { name: "Liquid AI", mark: "LQ", prompt: "liquid", color: 36, tip: "Ask Liquid models for concise technical reasoning." },
  nous: { name: "Nous Research", mark: "NOUS", prompt: "nous", color: 35, tip: "Ask Nous models for open-model coding and explanation help." },
  nousresearch: { name: "Nous Research", mark: "NOUS", prompt: "nous", color: 35, tip: "Ask Nous models for open-model coding and explanation help." },
  "nous-research": { name: "Nous Research", mark: "NOUS", prompt: "nous", color: 35, tip: "Ask Nous models for open-model coding and explanation help." },
  openrouter: { name: "OpenRouter", mark: "OR", prompt: "openrouter", color: 35, tip: "Ask the routed model for general coding and reasoning help." },
  anthropic: { name: "Claude Code", mark: "CL", prompt: "claude", color: CLAUDE_ORANGE, tip: "Use /plan before larger changes, then ask Claude to edit, debug, or explain.", officialCli: true },
  claude: { name: "Claude Code", mark: "CL", prompt: "claude", color: CLAUDE_ORANGE, tip: "Use /plan before larger changes, then ask Claude to edit, debug, or explain.", officialCli: true },
  openai: { name: "OpenAI Codex", mark: "OA", prompt: "codex", color: 32, tip: "Ask Codex for focused code changes, reviews, and verification steps.", officialCli: true },
  google: { name: "Gemini", mark: "GEM", prompt: "gemini", color: 34, tip: "Ask Gemini to edit files, explain context, or reason through a plan.", officialCli: true },
  gemini: { name: "Gemini", mark: "GEM", prompt: "gemini", color: 34, tip: "Ask Gemini to edit files, explain context, or reason through a plan.", officialCli: true }
};

export function providerInfoForModel(modelKey) {
  const provider = providerKeyForModel(modelKey);
  const info = PROVIDERS[provider] || {
    name: titleCase(provider || "OpenRouter"),
    mark: initials(provider || "OR"),
    prompt: compactToken(provider || "openrouter"),
    color: 35,
    tip: "Ask this OpenRouter model for coding, reasoning, or writing help."
  };
  return {
    provider,
    officialCli: Boolean(info.officialCli || OFFICIAL_CLI_PROVIDERS.has(provider)),
    ...info
  };
}

export function promptLabelForModel(modelKey, color = true) {
  const info = providerInfoForModel(modelKey);
  if (info.provider === "anthropic" || info.provider === "claude") return `${ansi("❯", info.color, color)} `;
  if (info.provider === "google" || info.provider === "gemini") return `${ansi(">", info.color, color)} `;
  if (info.provider === "openai") return `${ansi("›", info.color, color)} `;
  const shortModel = compactToken(String(modelKey || "auto").split("/").pop() || "auto");
  return `${ansi("❯", info.color, color)} ${info.prompt}:${shortModel} `;
}

export function renderIntroForModel({ modelKey = "auto", reasoningEffort = "medium", projectId = "", columns = 100, color = true } = {}) {
  const info = providerInfoForModel(modelKey);
  if (info.provider === "anthropic" || info.provider === "claude") return renderClaudeIntro({ info, modelKey, reasoningEffort, projectId, columns, color });
  if (info.provider === "google" || info.provider === "gemini") return renderGeminiIntro({ info, modelKey, projectId, columns, color });
  if (info.provider === "openai") return renderCodexIntro({ info, modelKey, reasoningEffort, projectId, columns, color });
  const width = Math.max(58, Math.min(100, Number(columns) || 100));
  const inner = width - 2;
  const title = `${info.name} via Vibyra`;
  const terminalMode = info.officialCli ? `${info.name} fallback terminal` : "OpenRouter API terminal";
  const lines = [
    center(`${ansi(info.mark, info.color, color)}  ${title}`, inner),
    "",
    center("Welcome back!", inner),
    center(providerArt(info, color), inner),
    "",
    `${displayModel(modelKey)} with ${reasoningEffort} effort`,
    `provider: ${info.name} · ${terminalMode}`,
    projectId ? `project: ${projectId}` : "project: current desktop workspace",
    "",
    "Tips for getting started",
    info.tip,
    "Use /plan, /review, /model, /clear, or /exit."
  ];

  return [
    `${ansi("╭", info.color, color)}${"─".repeat(inner)}${ansi("╮", info.color, color)}`,
    ...lines.map((line) => boxLine(line, inner, info.color, color)),
    `${ansi("╰", info.color, color)}${"─".repeat(inner)}${ansi("╯", info.color, color)}`,
    ""
  ].join("\r\n");
}

function renderClaudeIntro({ info, modelKey, reasoningEffort, projectId, columns, color }) {
  const width = Math.max(68, Math.min(104, Number(columns) || 100));
  const inner = width - 2;
  const meta = `${displayModel(modelKey)} with ${reasoningEffort} effort · Vibyra ·`;
  const cwd = projectId ? `project: ${projectId}` : "project: current desktop workspace";
  const placeholder = `❯ Try "edit AppContext.tsx to..."`;
  const footer = `? for shortcuts · ← for agents${" ".repeat(Math.max(2, inner - visibleLength("? for shortcuts · ← for agents") - visibleLength(`◉ ${reasoningEffort} · /effort`) - 2))}◉ ${reasoningEffort} · /effort`;
  const lines = [
    "Claude Code v2.1.145",
    "",
    center("Welcome back!", inner),
    ...CLAUDE_ASCII_ART.map((line) => center(ansi(line, info.color, color), inner)),
    "",
    center(meta, inner),
    center(cwd, inner),
    "",
    "Tips for getting started",
    "Ask Claude to edit, debug, or explain a file.",
    "Use /plan before larger changes.",
    "",
    "What's new",
    "Provider-specific Vibyra fallback when Claude Code is unavailable.",
    "",
    "─".repeat(Math.min(inner - 2, 72)),
    ansi(placeholder, info.color, color),
    "─".repeat(Math.min(inner - 2, 72)),
    footer
  ];
  return boxedLines(lines, inner, info.color, color);
}

function renderCodexIntro({ info, modelKey, reasoningEffort, projectId, columns, color }) {
  const width = Math.max(58, Math.min(90, Number(columns) || 88));
  const inner = width - 2;
  const directory = projectId ? `~/${compactToken(projectId)}` : "~/workspace";
  const model = `${displayModel(modelKey)} ${reasoningEffort}`;
  const rows = [
    ">_ OpenAI Codex (v0.132.0)",
    "",
    `model:     ${model}    /model to change`,
    "plan:      Vibyra",
    `directory: ${directory}`
  ];
  return [
    boxedLines(rows, inner, info.color, color),
    `${ansi("Tip:", info.color, color)} Use /feedback to send logs to the maintainers when something looks off.`,
    ""
  ].join("\r\n");
}

function renderGeminiIntro({ info, modelKey, projectId, columns, color }) {
  const width = Math.max(64, Math.min(104, Number(columns) || 100));
  const inner = width - 2;
  const letters = ["G", "E", "M", "I", "N", "I"].map((letter, index) => ansi(letter, [34, 36, 35, 35, 36, 34][index], color)).join(" ");
  const cwd = projectId ? `~/${compactToken(projectId)}` : "~/workspace";
  const lines = [
    center(`${ansi("✦", info.color, color)}  ${letters}`, inner),
    center("Gemini CLI v0.42.0", inner),
    "",
    "Tips for getting started:",
    "1. Ask questions, edit files, or run commands.",
    "2. Be specific for the best results.",
    "3. /help for more information.",
    "",
    `Using: Vibyra project context | ${displayModel(modelKey)}`,
    `${cwd} · no sandbox (see /docs) · auto`
  ];
  return boxedLines(lines, inner, info.color, color);
}

function boxedLines(lines, inner, colorCode, color) {
  return [
    `${ansi("╭", colorCode, color)}${"─".repeat(inner)}${ansi("╮", colorCode, color)}`,
    ...lines.map((line) => boxLine(line, inner, colorCode, color)),
    `${ansi("╰", colorCode, color)}${"─".repeat(inner)}${ansi("╯", colorCode, color)}`,
    ""
  ].join("\r\n");
}

export function formatAssistantReply(reply, modelKey = "auto", color = true) {
  const info = providerInfoForModel(modelKey);
  const token = info.provider === "openai" ? "•" : info.provider === "google" || info.provider === "gemini" ? "✦" : "⏺";
  const lines = String(reply || "").trim().split(/\r?\n/);
  return lines.map((line, index) => index === 0
    ? `${ansi(token, info.color, color)} ${line}`
    : `  ${line}`).join("\r\n");
}

if (isMainModule()) runTerminal();

function runTerminal() {
  const model = process.env.VIBYRA_OPENROUTER_MODEL || "auto";
  const reasoningEffort = normalizeReasoningEffort(process.env.VIBYRA_REASONING_EFFORT);
  const tokenMode = normalizeTokenMode(process.env.VIBYRA_TOKEN_MODE);
  const projectId = process.env.VIBYRA_TERMINAL_PROJECT_ID || "";
  const desktopUrl = normalizeDesktopUrl(process.env.VIBYRA_DESKTOP_URL, process.env.VIBYRA_DESKTOP_PORT);
  const color = terminalColorEnabled();
  const history = [];
  const rl = readline.createInterface({
    input,
    output,
    terminal: true,
    historySize: 100,
    prompt: promptLabelForModel(model, color)
  });

  printIntro({ model, reasoningEffort, projectId, color });
  rl.prompt();

  rl.on("line", async (line) => {
    const prompt = String(line || "").trim();
    if (!prompt) {
      if (!rl.closed) rl.prompt();
      return;
    }
    if (await handleLocalCommand({ command: prompt, rl, model, reasoningEffort, tokenMode, projectId, desktopUrl, history, color })) {
      if (!rl.closed) rl.prompt();
      return;
    }
    await sendPrompt({ prompt, model, reasoningEffort, tokenMode, projectId, desktopUrl, history, color });
    if (!rl.closed) rl.prompt();
  });

  rl.on("SIGINT", () => {
    output.write("\r\n");
    rl.prompt();
  });

  rl.on("close", () => {
    output.write("\r\n");
    process.exit(0);
  });
}

async function sendPrompt({ prompt, model, reasoningEffort, tokenMode, projectId, desktopUrl, history, color }) {
  const info = providerInfoForModel(model);
  const token = info.provider === "openai" ? "•" : info.provider === "google" || info.provider === "gemini" ? "✦" : "⏺";
  history.push({ role: "user", text: prompt });
  output.write(`\r\n${ansi(token, info.color, color)} ${info.name} is thinking with ${displayModel(model)}...\r\n`);
  try {
    const response = await fetch(`${desktopUrl}/desktop/chat`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        history: history.slice(-MAX_HISTORY - 1, -1),
        model,
        projectId,
        prompt,
        reasoningEffort,
        tokenMode
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false) throw chatError(response, result);
    const reply = String(result?.reply || "I received an empty response from Vibyra AI.").trim();
    history.push({ role: "assistant", text: reply });
    trimHistory(history);
    output.write(`\r\n${formatAssistantReply(reply, model, color)}\r\n\r\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vibyra AI could not complete this chat.";
    output.write(`\r\n${ansi("⚠", 31, color)} ${message}\r\n\r\n`);
  }
}

async function handleLocalCommand({ command, rl, model, reasoningEffort, tokenMode, projectId, desktopUrl, history, color }) {
  const [name, ...rest] = command.split(/\s+/);
  const key = name.toLowerCase();
  const info = providerInfoForModel(model);
  if (key === "/exit" || key === "exit") {
    rl.close();
    return true;
  }
  if (key === "/clear" || key === "clear") {
    output.write("\x1Bc");
    printIntro({ model, reasoningEffort, projectId, color });
    return true;
  }
  if (key === "/model") {
    output.write(`\r\n${ansi("⏺", info.color, color)} Model: ${displayModel(model)}\r\n  Provider: ${info.name}\r\n  Tokens: ${tokenMode === "provider" ? "connected provider account" : "Vibyra account"}\r\n  Reasoning: ${reasoningEffort}\r\n  Terminal: ${info.officialCli ? "Vibyra wrapper; official CLI also exists" : "Claude-style Vibyra OpenRouter wrapper"}\r\n\r\n`);
    return true;
  }
  if (key === "/help" || key === "help" || key === "vibyra") {
    output.write(`\r\n${ansi("⏺", info.color, color)} ${info.name} terminal commands\r\n  /model   Show selected model metadata\r\n  /plan    Send a planning prompt\r\n  /review  Send a review prompt\r\n  /clear   Clear this terminal\r\n  /exit    Close this terminal session\r\n\r\n`);
    return true;
  }
  if (key === "/plan" || key === "/debug" || key === "/review" || key === "/explain" || key === "/fix" || key === "/refactor") {
    const text = rest.join(" ").trim();
    if (text) await sendPrompt({ prompt: `${key.slice(1)}: ${text}`, model, reasoningEffort, tokenMode, projectId, desktopUrl, history, color });
    else output.write(`\r\nUsage: ${key} <prompt>\r\n\r\n`);
    return true;
  }
  return false;
}

function printIntro({ model, reasoningEffort, projectId, color }) {
  output.write(`${renderIntroForModel({ modelKey: model, reasoningEffort, projectId, columns: output.columns || 100, color })}\r\n`);
}

function trimHistory(history) {
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
}

function displayModel(modelKey) {
  return modelKey || "auto";
}

function providerArt(info, color) {
  const mark = String(info.mark || "OR").slice(0, 3).toUpperCase();
  return `${ansi("▐▛", info.color, color)} ${mark.padEnd(3, " ")} ${ansi("▜▌", info.color, color)}`;
}

function providerKeyForModel(modelKey) {
  const key = String(modelKey || "auto").toLowerCase();
  const provider = key.includes("/") ? key.split("/")[0] : "";
  if (provider) return provider;
  if (key.startsWith("claude-")) return "claude";
  if (key.startsWith("gemini-")) return "gemini";
  if (key.startsWith("gpt-") || key.includes("codex")) return "openai";
  return key || "openrouter";
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

export function terminalColorEnabled(env = process.env) {
  if (Object.hasOwn(env, "FORCE_COLOR")) {
    return !["0", "false", "never"].includes(String(env.FORCE_COLOR).trim().toLowerCase());
  }
  return !Object.hasOwn(env, "NO_COLOR");
}

function normalizeReasoningEffort(value) {
  const effort = String(value || "medium").trim();
  return ["low", "medium", "high", "xhigh", "none"].includes(effort) ? effort : "medium";
}

function normalizeTokenMode(value) {
  return String(value || "vibyra").trim().toLowerCase() === "provider" ? "provider" : "vibyra";
}

function normalizeDesktopUrl(url, port) {
  const explicit = String(url || "").trim().replace(/\/+$/, "");
  if (explicit) return explicit;
  const nextPort = Number.parseInt(String(port || "4317"), 10);
  return `http://127.0.0.1:${Number.isFinite(nextPort) ? nextPort : 4317}`;
}

function chatError(response, result) {
  const error = new Error(String(result?.error || result?.message || `Vibyra AI returned ${response.status}.`));
  error.status = response.status;
  return error;
}

function titleCase(value) {
  return compactToken(value).replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function initials(value) {
  const clean = compactToken(value).replace(/[^a-z0-9]/gi, "");
  return (clean.slice(0, 3) || "OR").toUpperCase();
}

function compactToken(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "model";
}

function isMainModule() {
  return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
}
