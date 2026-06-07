const previousTerminalGridMetaForLayout = terminalGridMeta;
terminalGridMeta = function terminalReadableGridMeta(count) {
  const meta = previousTerminalGridMetaForLayout(count);
  const total = Math.max(1, Math.min(maxTerminals, Number(count) || 1));
  meta.narrowCols = total === 1 ? 1 : 2;
  meta.narrowRows = Math.ceil(total / meta.narrowCols);
  return meta;
};
let terminalLayoutFrame = 0;
let terminalLayoutFitPending = false;
let terminalStageResizeObserver = null;
function scheduleTerminalLayoutSync(options = {}) {
  if (options?.fit) terminalLayoutFitPending = true;
  if (terminalLayoutFrame) return;
  const schedule = window.requestAnimationFrame || ((callback) => setTimeout(callback, 16));
  terminalLayoutFrame = schedule(() => {
    terminalLayoutFrame = 0;
    observeTerminalStage();
    syncResponsiveTerminalGrid();
    ensureActiveTerminalTabVisible();
    positionTerminalSettingsMenus();
    if (terminalLayoutFitPending) fitVisibleTerminalXterms();
    terminalLayoutFitPending = false;
  });
}
function observeTerminalStage() {
  if (!window.ResizeObserver) return;
  const stage = document.querySelector(".terminal-stage");
  if (!stage) {
    terminalStageResizeObserver?.observer?.disconnect?.();
    terminalStageResizeObserver = null;
    return;
  }
  if (terminalStageResizeObserver?.stage === stage) return;
  terminalStageResizeObserver?.observer?.disconnect?.();
  const size = measuredTerminalStageSize(stage.getBoundingClientRect());
  const state = { stage, observer: null, size };
  const observer = new ResizeObserver((entries) => {
    const next = measuredTerminalStageSize(entries[0]?.contentRect || stage.getBoundingClientRect());
    if (!next || sameTerminalStageSize(state.size, next)) return;
    state.size = next;
    scheduleTerminalLayoutSync({ fit: true });
  });
  state.observer = observer;
  observer.observe(stage);
  terminalStageResizeObserver = state;
}
function measuredTerminalStageSize(rect) {
  const width = Math.round(Number(rect?.width) || 0);
  const height = Math.round(Number(rect?.height) || 0);
  return width > 0 && height > 0 ? { width, height } : null;
}
function sameTerminalStageSize(left, right) {
  return Boolean(left && right && left.width === right.width && left.height === right.height);
}
function syncResponsiveTerminalGrid() {
  const page = document.querySelector(".terminal-page.grid-mode");
  const stage = page?.querySelector(".terminal-stage");
  if (!page || !stage) return;
  const count = stage.querySelectorAll(".terminal-tile:not(.terminal-maximized-hidden)").length;
  const size = measuredTerminalStageSize(stage.getBoundingClientRect());
  if (!count || !size || page.classList.contains("terminal-page--terminal-maximized")) return false;
  const layout = bestTerminalGrid(count, size.width, size.height, terminalGridMaxColumns());
  if (!layout.valid) return false;
  let changed = false;
  changed = setTerminalGridProperty(page, "--terminal-grid-cols", layout.cols) || changed;
  changed = setTerminalGridProperty(page, "--terminal-grid-rows", layout.rows) || changed;
  changed = setTerminalGridProperty(page, "--terminal-grid-cols-narrow", layout.cols) || changed;
  changed = setTerminalGridProperty(page, "--terminal-grid-rows-narrow", layout.rows) || changed;
  changed = setTerminalGridProperty(page, "--terminal-grid-min-row", `${layout.minRow}px`) || changed;
  if (page.classList.contains("terminal-grid-scroll") !== layout.scroll) {
    page.classList.toggle("terminal-grid-scroll", layout.scroll);
    changed = true;
  }
  return changed;
}
function terminalGridMaxColumns() {
  const width = Number(window.innerWidth) || 0;
  if (width > 0 && width <= 560) return 1;
  if (width > 0 && width <= 1000) return 2;
  return 4;
}
function setTerminalGridProperty(page, name, value) {
  const next = String(value);
  if (page.style.getPropertyValue(name) === next) return false;
  page.style.setProperty(name, next);
  return true;
}
function bestTerminalGrid(count, width, height, maxColumns = 4) {
  const total = Math.max(1, Math.min(maxTerminals, Number(count) || 1));
  const availableWidth = Number(width) || 0;
  const availableHeight = Number(height) || 0;
  const columnLimit = Math.max(1, Math.min(4, Number(maxColumns) || 1, total));
  if (availableWidth <= 0 || availableHeight <= 0) {
    return { cols: 1, rows: total, minRow: 170, scroll: true, valid: false };
  }
  const gap = 10;
  let best = null;
  for (let cols = 1; cols <= columnLimit; cols += 1) {
    const rows = Math.ceil(total / cols);
    const cellWidth = (availableWidth - gap * (cols - 1)) / cols;
    const cellHeight = (availableHeight - gap * (rows - 1)) / rows;
    const widthDeficit = Math.max(0, 220 - cellWidth);
    const heightDeficit = Math.max(0, 170 - cellHeight);
    const aspect = cellHeight > 0 ? cellWidth / cellHeight : 0;
    const score = widthDeficit * 8 + heightDeficit * 10 + Math.abs(Math.log(Math.max(0.1, aspect) / 1.45)) * 45;
    if (!best || score < best.score) best = { cols, rows, cellHeight, score };
  }
  const minRow = Math.max(170, Math.min(230, Math.floor(best?.cellHeight || 170)));
  return {
    cols: best?.cols || 1,
    rows: best?.rows || total,
    minRow,
    scroll: Boolean(best && best.cellHeight < 170),
    valid: true
  };
}
function ensureActiveTerminalTabVisible() {
  const list = document.querySelector(".terminal-tab-list");
  const active = list?.querySelector(".terminal-tab.active");
  if (!list || !active) return;
  const next = terminalTabScrollTarget(list.getBoundingClientRect(), active.getBoundingClientRect(), list.scrollLeft);
  if (next !== list.scrollLeft) list.scrollTo({ left: next });
}

function terminalTabScrollTarget(listRect, activeRect, scrollLeft = 0) {
  const padding = 6;
  if (activeRect.left < listRect.left + padding) {
    return Math.max(0, Math.round(scrollLeft + activeRect.left - listRect.left - padding));
  }
  if (activeRect.right > listRect.right - padding) {
    return Math.max(0, Math.round(scrollLeft + activeRect.right - listRect.right + padding));
  }
  return scrollLeft;
}

function terminalNodeCanFit(node) {
  if (!node?.isConnected) return false;
  if (node.closest(".terminal-focus-hidden, .terminal-minimized, .terminal-maximized-hidden")) return false;
  const rect = node.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function fitVisibleTerminalXterms() {
  if (typeof fitPtyXterm !== "function") return;
  document.querySelectorAll("[data-terminal-xterm]").forEach((node) => {
    if (!terminalNodeCanFit(node)) return;
    const id = node.dataset.terminalXterm || "";
    if (id) fitPtyXterm(id, node);
  });
}

function positionTerminalSettingsMenus() {
  document.querySelectorAll(".terminal-settings-menu").forEach((menu) => {
    const button = menu.parentElement?.querySelector("[data-terminal-settings]");
    if (!button) return;
    menu.classList.add("terminal-settings-menu--positioned");
    const buttonRect = button.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const gap = 8;
    const edge = 8;
    const topbarBottom = document.querySelector(".topbar")?.getBoundingClientRect().bottom || 0;
    if (buttonRect.bottom <= topbarBottom || buttonRect.top >= window.innerHeight) {
      settingsTerminalId = "";
      menu.remove();
      return;
    }
    const left = Math.min(
      window.innerWidth - menuRect.width - edge,
      Math.max(edge, buttonRect.right - menuRect.width)
    );
    const below = buttonRect.bottom + gap;
    const preferredTop = below + menuRect.height <= window.innerHeight - edge
      ? below
      : Math.max(edge, buttonRect.top - menuRect.height - gap);
    const top = Math.min(window.innerHeight - menuRect.height - edge, preferredTop);
    menu.style.setProperty("--terminal-menu-left", `${Math.round(left)}px`);
    menu.style.setProperty("--terminal-menu-top", `${Math.round(top)}px`);
  });
}

const previousBindPtyTopbarControlsForLayout = bindPtyTopbarControls;
bindPtyTopbarControls = function bindReadableTerminalTopbarControls() {
  previousBindPtyTopbarControlsForLayout();
  scheduleTerminalLayoutSync();
};

const previousRefreshPtySettingsForLayout = refreshPtyTerminalSettingsMenus;
refreshPtyTerminalSettingsMenus = function refreshReadableTerminalSettingsMenus() {
  const stable = previousRefreshPtySettingsForLayout();
  scheduleTerminalLayoutSync();
  return stable;
};

window.addEventListener("resize", scheduleTerminalLayoutSync);
document.addEventListener("scroll", (event) => {
  if (event.target?.closest?.(".terminal-stage")) scheduleTerminalLayoutSync();
}, true);
