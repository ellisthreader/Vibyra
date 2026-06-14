const terminalCompanionWidthKey = "vibyra.desktop.terminalCompanionWidth";
const terminalCompanionDefaultWidth = 520;
const terminalCompanionMinimumWidth = 360;
const terminalCompanionMaximumWidth = 920;
const terminalCompanionMinimumTerminalWidth = 360;
let terminalCompanionWidth = Number(localStorage.getItem(terminalCompanionWidthKey)) || terminalCompanionDefaultWidth;
let terminalMemoryFullscreen = false;
let terminalCompanionResizeFrame = 0;

const previousCloseTerminalCompanionPanelForLayout = closeTerminalCompanionPanel;
closeTerminalCompanionPanel = function closeTerminalCompanionPanelWithLayout() {
  if (terminalMemoryFullscreen) setTerminalMemoryFullscreen(false);
  previousCloseTerminalCompanionPanelForLayout();
};

function terminalCompanionWidthBounds(pageWidth) {
  const available = Math.max(terminalCompanionMinimumWidth, Number(pageWidth) || 0);
  return {
    minimum: terminalCompanionMinimumWidth,
    maximum: Math.max(
      terminalCompanionMinimumWidth,
      Math.min(terminalCompanionMaximumWidth, available - terminalCompanionMinimumTerminalWidth)
    )
  };
}

function clampTerminalCompanionWidth(value, pageWidth) {
  const bounds = terminalCompanionWidthBounds(pageWidth);
  const width = Number(value) || terminalCompanionDefaultWidth;
  return Math.round(Math.min(bounds.maximum, Math.max(bounds.minimum, width)));
}

function terminalMemoryIsFullscreen() {
  return terminalMemoryFullscreen;
}

function bindTerminalCompanionLayout(root = document) {
  const companion = root.querySelector?.("[data-terminal-companion]") || document.querySelector("[data-terminal-companion]");
  const page = companion?.closest(".terminal-page, .terminal-setup");
  if (!companion || !page) return;
  applyTerminalCompanionWidth(page);
  applyTerminalMemoryFullscreen(page);
  bindTerminalCompanionResizer(companion, page);
  bindTerminalMemoryFullscreenButtons(companion);
}

function applyTerminalCompanionWidth(page) {
  terminalCompanionWidth = clampTerminalCompanionWidth(terminalCompanionWidth, page.clientWidth);
  page.style.setProperty("--terminal-companion-width", `${terminalCompanionWidth}px`);
  const separator = page.querySelector("[data-terminal-companion-resizer]");
  if (separator) {
    const bounds = terminalCompanionWidthBounds(page.clientWidth);
    separator.setAttribute("aria-valuemin", String(bounds.minimum));
    separator.setAttribute("aria-valuemax", String(bounds.maximum));
    separator.setAttribute("aria-valuenow", String(terminalCompanionWidth));
  }
}

function bindTerminalCompanionResizer(companion, page) {
  const separator = companion.querySelector("[data-terminal-companion-resizer]");
  if (!separator || separator.dataset.terminalCompanionResizerBound) return;
  separator.dataset.terminalCompanionResizerBound = "1";
  separator.addEventListener("pointerdown", (event) => {
    if (terminalMemoryFullscreen || event.button !== 0) return;
    event.preventDefault();
    separator.setPointerCapture?.(event.pointerId);
    page.classList.add("terminal-companion-resizing");
    const startX = event.clientX;
    const startWidth = terminalCompanionWidth;
    const move = (moveEvent) => {
      terminalCompanionWidth = clampTerminalCompanionWidth(
        startWidth + startX - moveEvent.clientX,
        page.clientWidth
      );
      applyTerminalCompanionWidth(page);
      scheduleTerminalCompanionResizeFit();
    };
    const stop = () => {
      separator.removeEventListener("pointermove", move);
      separator.removeEventListener("pointerup", stop);
      separator.removeEventListener("pointercancel", stop);
      page.classList.remove("terminal-companion-resizing");
      localStorage.setItem(terminalCompanionWidthKey, String(terminalCompanionWidth));
      scheduleTerminalCompanionResizeFit();
    };
    separator.addEventListener("pointermove", move);
    separator.addEventListener("pointerup", stop);
    separator.addEventListener("pointercancel", stop);
  });
  separator.addEventListener("keydown", (event) => {
    if (terminalMemoryFullscreen || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const bounds = terminalCompanionWidthBounds(page.clientWidth);
    if (event.key === "Home") terminalCompanionWidth = bounds.minimum;
    else if (event.key === "End") terminalCompanionWidth = bounds.maximum;
    else terminalCompanionWidth += event.key === "ArrowLeft" ? 24 : -24;
    terminalCompanionWidth = clampTerminalCompanionWidth(terminalCompanionWidth, page.clientWidth);
    applyTerminalCompanionWidth(page);
    localStorage.setItem(terminalCompanionWidthKey, String(terminalCompanionWidth));
    scheduleTerminalCompanionResizeFit();
  });
}

function setTerminalMemoryFullscreen(nextValue) {
  terminalMemoryFullscreen = Boolean(nextValue);
  if (
    terminalMemoryFullscreen
    && typeof terminalMemoryState !== "undefined"
    && terminalMemoryState?.expandedIds
    && Array.isArray(terminalMemoryState.nodes)
  ) {
    terminalMemoryState.nodes
      .filter((node) => node.type === "folder" && !node.parentId)
      .forEach((node) => terminalMemoryState.expandedIds.add(node.id));
  }
  const page = document.querySelector(".terminal-page--with-companion, .terminal-setup--with-companion");
  if (page) applyTerminalMemoryFullscreen(page);
  if (typeof terminalMemoryRefresh === "function") terminalMemoryRefresh();
  if (!terminalMemoryFullscreen) scheduleTerminalCompanionResizeFit();
}

function applyTerminalMemoryFullscreen(page) {
  const enabled = terminalMemoryFullscreen && Boolean(page.querySelector("[data-terminal-memory-workspace]"));
  page.classList.toggle("terminal-page--memory-fullscreen", enabled);
  document.body.classList.toggle("terminal-memory-fullscreen-active", enabled);
  page.querySelectorAll("[data-terminal-memory-fullscreen]").forEach((button) => {
    button.classList.toggle("active", enabled);
    button.setAttribute("aria-pressed", enabled ? "true" : "false");
    button.setAttribute("aria-label", enabled ? "Restore terminal and Memory split" : "Open Memory workspace");
    button.title = enabled ? "Restore terminal and Memory split" : "Open Memory workspace";
    button.innerHTML = icon(enabled ? "split" : "square");
  });
}

function bindTerminalMemoryFullscreenButtons(root) {
  root.querySelectorAll("[data-terminal-memory-fullscreen]").forEach((button) => {
    if (button.dataset.terminalMemoryFullscreenBound) return;
    button.dataset.terminalMemoryFullscreenBound = "1";
    button.addEventListener("click", () => setTerminalMemoryFullscreen(!terminalMemoryFullscreen));
  });
}

function scheduleTerminalCompanionResizeFit() {
  if (terminalCompanionResizeFrame) return;
  const schedule = window.requestAnimationFrame || ((callback) => setTimeout(callback, 16));
  terminalCompanionResizeFrame = schedule(() => {
    terminalCompanionResizeFrame = 0;
    if (typeof scheduleTerminalCompanionFit === "function") scheduleTerminalCompanionFit();
  });
}

window.addEventListener("resize", () => {
  const page = document.querySelector(".terminal-page--with-companion, .terminal-setup--with-companion");
  if (!page) return;
  applyTerminalCompanionWidth(page);
  scheduleTerminalCompanionResizeFit();
});
