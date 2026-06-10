let terminalRuntimeState = { runtimes: [], providerFallback: null };
let terminalRuntimeNotice = "";
const terminalRuntimeInstalling = new Set();
const terminalBundledAgentRuntime = {
  id: "vibyra-agent",
  label: "Vibyra Agent",
  available: true,
  adapterReady: true,
  bundled: true,
  installable: false,
  installing: false
};

function terminalRuntimeById(id) {
  const runtime = terminalRuntimeState.runtimes.find((item) => item.id === id);
  if (runtime) return runtime;
  if (id === terminalBundledAgentRuntime.id) return terminalBundledAgentRuntime;
  return {
    id,
    label: id,
    available: false,
    bundled: false,
    installing: terminalRuntimeInstalling.has(id)
  };
}

function terminalExecutionRuntimeForModel(model, tokenMode = "vibyra") {
  const nativeRuntime = terminalNativeRuntimeForModel(model);
  if (tokenMode === "provider") return nativeRuntime;
  return nativeRuntime || terminalBundledAgentRuntime.id;
}

function terminalNativeRuntimeForModel(model) {
  const key = String(model?.modelKey || model?.key || "").trim().toLowerCase();
  const modelName = key.includes("/") ? key.split("/", 2)[1] : key;
  const provider = typeof terminalProviderKeyForModel === "function"
    ? terminalProviderKeyForModel(model)
    : String(model?.provider || "").trim().toLowerCase();
  if (
    (provider === "openai" || !key.includes("/"))
    && /^(gpt-|codex|o1|o3|o4|chatgpt-)/.test(modelName)
  ) return "codex";
  if (
    (provider === "claude" || provider === "anthropic" || !key.includes("/"))
    && modelName.startsWith("claude-")
  ) return "claude";
  if (
    (provider === "gemini" || provider === "google" || !key.includes("/"))
    && modelName.startsWith("gemini-")
  ) return "gemini";
  if (
    (provider === "qwen" || provider === "alibaba")
    && /^(qwen-|qwen2|qwen3)/.test(modelName)
  ) return "qwen";
  if (
    (provider === "mistral" || provider === "mistralai")
    && /^(mistral-|ministral-|codestral-|devstral-)/.test(modelName)
  ) return "mistral";
  if (
    (provider === "moonshot" || provider === "moonshotai" || provider === "kimi")
    && modelName.startsWith("kimi-")
  ) return "kimi";
  return "";
}

function terminalRuntimeAdapterState(runtime) {
  const adapter = runtime?.adapter && typeof runtime.adapter === "object"
    ? runtime.adapter
    : null;
  const ready = typeof runtime?.adapterReady === "boolean"
    ? runtime.adapterReady
    : adapter?.ready === true;
  return {
    ready,
    reason: String(
      runtime?.adapterIssue
      || runtime?.adapterReason
      || adapter?.issue
      || adapter?.reason
      || ""
    ).trim()
  };
}

function terminalRuntimeLaunchState(model, tokenMode = "vibyra") {
  const key = String(model?.modelKey || model?.key || "").trim().toLowerCase();
  const auto = !key || key === "auto";
  if (auto) {
    if (tokenMode === "vibyra") {
      return {
        available: true,
        issue: "",
        reason: "auto",
        runtime: null,
        surface: "auto",
        label: "Auto routing"
      };
    }
    return {
      available: false,
      issue: "Auto terminal routing is only available with Vibyra tokens.",
      reason: "auto",
      runtime: null,
      surface: "unavailable",
      label: "Unavailable"
    };
  }
  const nativeRuntimeId = terminalNativeRuntimeForModel(model);
  const runtimeId = terminalExecutionRuntimeForModel(model, tokenMode);
  if (!runtimeId) {
    return {
      available: false,
      issue: "This model is only available with Vibyra tokens.",
      reason: "account",
      runtime: null,
      surface: "unavailable",
      label: "Unavailable"
    };
  }

  const runtime = terminalRuntimeById(runtimeId);
  if (!runtime.available) {
    const downloadable = Boolean(nativeRuntimeId && runtime.installable !== false && !runtime.bundled);
    return {
      available: false,
      issue: downloadable
        ? `${runtime.label || "The CLI"} must be downloaded before this terminal can open.`
        : `${runtime.label || "This runtime"} is unavailable.`,
      reason: downloadable ? "runtime" : "unavailable",
      runtime,
      surface: downloadable ? "download" : "unavailable",
      label: downloadable ? "Download" : "Unavailable"
    };
  }

  if (tokenMode !== "provider") {
    const adapter = terminalRuntimeAdapterState(runtime);
    if (!adapter.ready) {
      return {
        available: false,
        issue: adapter.reason || `${runtime.label || "This provider"} is not available with Vibyra credits yet.`,
        reason: "adapter",
        runtime,
        surface: "unavailable",
        label: "Unavailable"
      };
    }
  }

  const agent = runtime.id === terminalBundledAgentRuntime.id;
  return {
    available: true,
    issue: "",
    reason: "",
    runtime,
    surface: agent ? "agent" : "native",
    label: agent ? "Vibyra Agent" : "Native CLI"
  };
}

function terminalRuntimeLaunchIssue(model, tokenMode = "vibyra") {
  return terminalRuntimeLaunchState(model, tokenMode).issue;
}

function terminalRuntimePickerState(model, tokenMode = "vibyra") {
  const launch = terminalRuntimeLaunchState(model, tokenMode);
  if (
    tokenMode === "provider"
    && typeof terminalModelAvailableForTokenMode === "function"
    && !terminalModelAvailableForTokenMode(model, tokenMode)
  ) {
    const issue = typeof terminalTokenSourceIssue === "function"
      ? terminalTokenSourceIssue(model, tokenMode)
      : "";
    return {
      ...launch,
      available: false,
      issue: issue || "This model is only available with Vibyra tokens.",
      reason: "account",
      surface: "unavailable",
      label: "Unavailable"
    };
  }
  return launch;
}

function terminalRuntimeLaunchIssueForRequest(model, tokenMode = "vibyra", initialPrompt = "") {
  const key = String(model?.modelKey || model?.key || "").trim().toLowerCase();
  if (key !== "auto") return terminalRuntimeLaunchIssue(model, tokenMode);
  if (tokenMode !== "vibyra") return "Auto terminal routing is only available with Vibyra tokens.";
  return "";
}

function terminalModelCliControl(model, tokenMode = "vibyra") {
  const launch = terminalRuntimePickerState(model, tokenMode);
  const runtime = launch.runtime;
  const installing = runtime && (runtime.installing || terminalRuntimeInstalling.has(runtime.id));
  if (launch.surface === "download" && installing) {
    return `<button class="terminal-model-cli-download installing" type="button" disabled aria-busy="true" aria-label="Downloading ${escapeAttribute(runtime.label || "CLI")}"><span class="terminal-model-download-spinner" aria-hidden="true"></span><span>Downloading</span></button>`;
  }
  if (launch.surface === "download" && runtime) {
    const label = `Download ${runtime.label || "CLI"}`;
    return `<button class="terminal-model-cli-download" type="button" data-terminal-runtime-install="${escapeAttribute(runtime.id)}" aria-label="${escapeAttribute(label)}" title="${escapeAttribute(label)}">${icon("download")}<span>Download</span></button>`;
  }
  const label = launch.label || (launch.available ? "Native CLI" : "Unavailable");
  const title = launch.issue || label;
  return `<em class="terminal-model-runtime-status ${escapeAttribute(launch.surface || "unavailable")}" title="${escapeAttribute(title)}">${escapeHtml(label)}</em>`;
}

function bindTerminalRuntimeControls(root = document) {
  root.querySelectorAll?.("[data-terminal-runtime-install]").forEach((button) => {
    if (button.dataset.runtimeInstallBound) return;
    button.dataset.runtimeInstallBound = "1";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      installTerminalRuntime(button.dataset.terminalRuntimeInstall);
    });
  });
}

async function installTerminalRuntime(id) {
  if (!id || terminalRuntimeInstalling.has(id)) return;
  terminalRuntimeInstalling.add(id);
  terminalRuntimeNotice = "";
  refreshTerminalRuntimePickers();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300_000);
  try {
    const response = await fetch(`/desktop/terminal-runtimes/${encodeURIComponent(id)}/install`, {
      method: "POST",
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) throw new Error(payload.error || "The CLI could not be downloaded.");
    terminalRuntimeState = { runtimes: payload.runtimes || [], providerFallback: payload.providerFallback || null };
    terminalRuntimeNotice = `${payload.runtime?.label || "CLI"} download complete.`;
  } catch (error) {
    terminalRuntimeNotice = error?.name === "AbortError"
      ? "The CLI download timed out. Try again."
      : error instanceof Error ? error.message : "The CLI could not be downloaded.";
  } finally {
    clearTimeout(timeout);
    terminalRuntimeInstalling.delete(id);
    if (!refreshTerminalRuntimePickers()) render();
  }
}

function refreshTerminalRuntimePickers() {
  const pickers = [...(document.querySelectorAll?.("[data-terminal-model-picker]") || [])];
  if (!pickers.length) return false;
  for (const picker of pickers) {
    const input = picker.querySelector?.("[data-terminal-model-search]");
    if (input && typeof renderTerminalModelSearchResults === "function") {
      renderTerminalModelSearchResults(input);
    }
    let notice = picker.querySelector?.(".terminal-model-cli-notice");
    if (!terminalRuntimeNotice) {
      notice?.remove();
      continue;
    }
    if (!notice) {
      notice = document.createElement("em");
      notice.className = "terminal-model-cli-notice";
      picker.querySelector?.(".terminal-model-scroll")?.before(notice);
    }
    notice.textContent = terminalRuntimeNotice;
  }
  return true;
}

async function loadTerminalRuntimes() {
  try {
    const response = await fetch("/desktop/terminal-runtimes");
    const payload = await response.json().catch(() => ({}));
    if (response.ok && Array.isArray(payload.runtimes)) terminalRuntimeState = payload;
  } catch {}
  if (currentPage === "terminals" && !refreshTerminalRuntimePickers()) render();
}

window.addEventListener("load", () => setTimeout(loadTerminalRuntimes, 0));
