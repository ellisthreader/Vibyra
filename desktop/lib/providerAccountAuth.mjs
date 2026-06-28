import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { terminalRuntimeExecutable } from "./aiTerminalRuntimes.mjs";
import { readProviderAuthState } from "./providerAccountState.mjs";

const PROVIDERS = {
  codex: { label: "OpenAI", runtime: "codex" },
  claude: { label: "Anthropic", runtime: "claude" },
  gemini: { label: "Google", runtime: "gemini" }
};
const loginProcesses = new Map();

export function providerAccountAuthState(provider) {
  const definition = providerDefinition(provider);
  const executable = terminalRuntimeExecutable(definition.runtime);
  const auth = executable ? readProviderAuthState(provider, executable) : disconnectedState();
  const pending = loginProcesses.get(provider);
  if (auth.connected && pending) stopLoginProcess(provider);
  return {
    provider,
    runtime: definition.runtime,
    label: definition.label,
    available: Boolean(executable),
    connected: Boolean(auth.connected),
    status: auth.connected
      ? "connected"
      : pending?.status === "error"
        ? "error"
        : pending ? "connecting" : executable ? "sign-in-required" : "not-installed",
    accountLabel: String(auth.accountLabel || ""),
    detail: auth.connected
      ? String(auth.detail || "Connected through the official CLI.")
      : pending?.message || (executable ? "Sign in with your existing account." : "Install the official CLI to connect."),
    authMode: String(auth.authMode || ""),
    loginUrl: String(pending?.loginUrl || ""),
    updatedAt: String(auth.updatedAt || "")
  };
}

export function startProviderAccountLogin(provider) {
  const definition = providerDefinition(provider);
  const executable = terminalRuntimeExecutable(definition.runtime);
  if (!executable) throw httpError(409, `Install ${runtimeLabel(provider)} before signing in.`);
  stopLoginProcess(provider);
  const geminiLogin = provider === "gemini";
  if (geminiLogin) writeGeminiGoogleAuthSettings();
  const command = providerAccountLoginCommand(provider, executable);
  const child = spawn(command.command, command.args, {
    cwd: homedir(),
    env: personalAccountEnvironment(),
    stdio: [geminiLogin ? "pipe" : "ignore", "pipe", "pipe"],
    windowsHide: true
  });
  const state = {
    child,
    confirmedBrowserOpen: false,
    loginUrl: "",
    message: "Finish signing in through the provider window or browser.",
    openedLoginUrl: false,
    outputTail: "",
    provider,
    status: "connecting"
  };
  loginProcesses.set(provider, state);
  const onData = (chunk) => {
    const text = cleanOutput(chunk);
    state.outputTail = `${state.outputTail}${text}`.slice(-4000);
    confirmGeminiBrowserOpen(state);
    const url = firstUrl(state.outputTail);
    if (url) {
      state.loginUrl = url;
      state.message = "A secure provider sign-in page is ready. Finish in your browser.";
      openLoginUrlOnce(state, url);
    }
  };
  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);
  child.once("error", (error) => {
    state.status = "error";
    state.message = error.message || "The provider sign-in could not start.";
  });
  child.once("close", (code) => {
    if (loginProcesses.get(provider) !== state) return;
    const connected = readProviderAuthState(provider, executable).connected;
    if (connected) {
      loginProcesses.delete(provider);
      return;
    }
    state.status = "error";
    state.message = code === 0
      ? "Sign-in was not completed."
      : "The provider sign-in closed before the account connected.";
  });
  return providerAccountAuthState(provider);
}

export function cancelProviderAccountLogin(provider) {
  providerDefinition(provider);
  stopLoginProcess(provider);
  return providerAccountAuthState(provider);
}

export function disconnectProviderAccount(provider) {
  const definition = providerDefinition(provider);
  const executable = terminalRuntimeExecutable(definition.runtime);
  stopLoginProcess(provider);
  if (!executable) return providerAccountAuthState(provider);
  if (provider === "gemini") disconnectGemini();
  else {
    const args = provider === "codex" ? ["logout"] : ["auth", "logout"];
    const result = spawnSync(executable, args, {
      cwd: homedir(),
      env: personalAccountEnvironment(),
      encoding: "utf8",
      timeout: 15_000
    });
    if (result.error || result.status !== 0) {
      throw httpError(409, cleanOutput(result.stderr) || `Could not disconnect ${definition.label}.`);
    }
  }
  return providerAccountAuthState(provider);
}

export function providerAccountLoginCommand(provider, executable) {
  if (provider === "codex") return { command: executable, args: ["login"] };
  if (provider === "claude") return { command: executable, args: ["auth", "login", "--claudeai"] };
  if (provider === "gemini") return { command: executable, args: [] };
  if (process.platform === "linux" && existsSync("/usr/bin/script")) {
    return {
      command: "/usr/bin/script",
      args: ["-qf", "-e", "-E", "never", "-c", shellQuote(executable), "/dev/null"]
    };
  }
  return { command: executable, args: [] };
}

export function writeGeminiGoogleAuthSettings(path = geminiSettingsPath()) {
  let settings = {};
  try { settings = JSON.parse(readFileSync(path, "utf8")); } catch {}
  settings.security = settings.security && typeof settings.security === "object" ? settings.security : {};
  settings.security.auth = settings.security.auth && typeof settings.security.auth === "object"
    ? settings.security.auth : {};
  settings.security.auth.selectedType = "oauth-personal";
  settings.security.auth.useExternal = true;
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  try { chmodSync(path, 0o600); } catch {}
}

export function geminiBrowserPromptNeedsConfirmation(value) {
  return /Opening authentication page in your browser/i.test(String(value || ""))
    && /Do you want to continue\?\s*\[Y\/n\]:?/i.test(String(value || ""));
}

function confirmGeminiBrowserOpen(state) {
  if (state.provider !== "gemini" || state.confirmedBrowserOpen) return;
  if (!geminiBrowserPromptNeedsConfirmation(state.outputTail)) return;
  state.confirmedBrowserOpen = true;
  state.message = "Opening Google sign-in in your browser.";
  try { state.child.stdin?.write("y\n"); } catch {}
}

function disconnectGemini() {
  rmSync(join(geminiHome(), "oauth_creds.json"), { force: true });
  const path = geminiSettingsPath();
  try {
    const settings = JSON.parse(readFileSync(path, "utf8"));
    if (settings?.security?.auth?.selectedType === "oauth-personal") {
      delete settings.security.auth.selectedType;
      delete settings.security.auth.useExternal;
      writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
    }
  } catch {}
}

function stopLoginProcess(provider) {
  const state = loginProcesses.get(provider);
  if (!state) return;
  loginProcesses.delete(provider);
  try { state.child.kill("SIGTERM"); } catch {}
}

function personalAccountEnvironment() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|SECRET)$/i.test(key)) delete env[key];
  }
  return env;
}

function providerDefinition(provider) {
  const key = String(provider || "").trim().toLowerCase();
  const definition = PROVIDERS[key];
  if (!definition) throw httpError(404, "Unknown AI account provider.");
  return definition;
}

function runtimeLabel(provider) {
  return provider === "codex" ? "Codex CLI" : provider === "claude" ? "Claude Code" : "Gemini CLI";
}

function disconnectedState() {
  return { connected: false, accountLabel: "", detail: "", authMode: "", updatedAt: "" };
}

function cleanOutput(value) {
  return String(value || "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .trim()
    .slice(-800);
}

export function firstUrl(value) {
  const match = String(value || "").match(/https?:\/\/[^\s"'<>\\\])}]+/i);
  return match ? match[0].replace(/[.,;:!?]+$/, "") : "";
}

function openLoginUrlOnce(state, url) {
  if (state.openedLoginUrl || !url) return;
  state.openedLoginUrl = true;
  openSystemBrowser(url);
}

function openSystemBrowser(url) {
  const command = process.platform === "darwin"
    ? { cmd: "open", args: [url] }
    : process.platform === "win32"
      ? { cmd: "cmd", args: ["/c", "start", "", url] }
      : { cmd: "xdg-open", args: [url] };
  try {
    const child = spawn(command.cmd, command.args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    child.on("error", () => {});
    child.unref();
  } catch {}
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function geminiHome() {
  return join(homedir(), ".gemini");
}

function geminiSettingsPath() {
  return join(geminiHome(), "settings.json");
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
