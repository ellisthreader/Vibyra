const previousTerminalGridMetaForLayout = terminalGridMeta;
terminalGridMeta = function terminalReadableGridMeta(count) {
  const meta = previousTerminalGridMetaForLayout(count);
  const total = Math.max(1, Math.min(maxTerminals, Number(count) || 1));
  meta.narrowCols = total === 1 ? 1 : 2;
  meta.narrowRows = Math.ceil(total / meta.narrowCols);
  return meta;
};

let terminalLayoutFrame = 0;

function scheduleTerminalLayoutSync() {
  if (terminalLayoutFrame) return;
  const schedule = window.requestAnimationFrame || ((callback) => setTimeout(callback, 16));
  terminalLayoutFrame = schedule(() => {
    terminalLayoutFrame = 0;
    ensureActiveTerminalTabVisible();
    positionTerminalNewMenu();
    positionTerminalSettingsMenus();
    if (typeof mountVisibleXterms === "function") mountVisibleXterms();
  });
}

function ensureActiveTerminalTabVisible() {
  const list = document.querySelector(".terminal-tab-list");
  const active = list?.querySelector(".terminal-tab.active");
  if (!list || !active) return;
  const left = active.offsetLeft;
  const right = left + active.offsetWidth;
  const visibleLeft = list.scrollLeft;
  const visibleRight = visibleLeft + list.clientWidth;
  if (left < visibleLeft) list.scrollTo({ left: Math.max(0, left - 6) });
  else if (right > visibleRight) list.scrollTo({ left: right - list.clientWidth + 6 });
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

function positionTerminalNewMenu() {
  const button = document.getElementById("open-terminal-new");
  const menu = document.querySelector('.terminal-new-wrap [data-terminal-model-picker="new"]');
  if (!button || !menu) return;
  const buttonRect = button.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const containingRect = terminalFixedContainingRect(menu);
  const gap = 8;
  const edge = 8;
  const viewportLeft = Math.min(
    window.innerWidth - menuRect.width - edge,
    Math.max(edge, buttonRect.left)
  );
  const below = buttonRect.bottom + gap;
  const viewportTop = below + menuRect.height <= window.innerHeight - edge
    ? below
    : Math.max(edge, buttonRect.top - menuRect.height - gap);
  menu.style.setProperty("--terminal-new-menu-left", `${Math.round(viewportLeft - containingRect.left)}px`);
  menu.style.setProperty("--terminal-new-menu-top", `${Math.round(viewportTop - containingRect.top)}px`);
  menu.classList.add("terminal-model-picker--positioned");
}

function terminalFixedContainingRect(node) {
  for (let parent = node.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    const styles = getComputedStyle(parent);
    if (styles.transform !== "none" || styles.perspective !== "none" || styles.filter !== "none") {
      return parent.getBoundingClientRect();
    }
  }
  return { left: 0, top: 0 };
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
