let customSelectDismissBound = false;

function customSelectHtml(config = {}) {
  const options = Array.isArray(config.options) ? config.options : [];
  const value = String(config.value ?? options[0]?.value ?? "");
  const selected = options.find((option) => String(option.value) === value) || options[0] || {};
  const id = String(config.id || `custom-select-${Math.random().toString(36).slice(2)}`);
  const classes = ["custom-select", config.className].filter(Boolean).join(" ");
  const inputAttributes = customSelectAttributes(config.inputAttributes);
  const disabled = config.disabled ? " disabled" : "";
  const label = config.ariaLabel || config.label || "Choose an option";
  return `<div class="${escapeAttribute(classes)}" data-custom-select>
    <input type="hidden" id="${escapeAttribute(id)}" value="${escapeAttribute(value)}"${inputAttributes} />
    <button class="custom-select-trigger" type="button" data-custom-select-trigger aria-haspopup="listbox" aria-expanded="false" aria-controls="${escapeAttribute(id)}-menu" aria-label="${escapeAttribute(label)}"${disabled}>
      <span data-custom-select-value>${escapeHtml(selected.label || config.placeholder || "Choose")}</span>${icon("chevron-down")}
    </button>
    <div class="custom-select-menu" id="${escapeAttribute(id)}-menu" data-custom-select-menu role="listbox" aria-label="${escapeAttribute(label)}" hidden>
      ${customSelectOptionsHtml(options, value)}
    </div>
  </div>`;
}

function customSelectOptionsHtml(options, value) {
  let group = null;
  return options.map((option) => {
    const nextGroup = String(option.group || "");
    const heading = nextGroup && nextGroup !== group
      ? `<span class="custom-select-group-label" role="presentation">${escapeHtml(nextGroup)}</span>`
      : "";
    group = nextGroup;
    const selected = String(option.value) === String(value);
    const disabled = option.disabled ? " disabled aria-disabled=\"true\"" : "";
    const detail = option.detail ? `<small>${escapeHtml(option.detail)}</small>` : "";
    return `${heading}<button class="custom-select-option${selected ? " is-selected" : ""}" type="button" role="option" tabindex="-1" aria-selected="${selected}" data-custom-select-option="${escapeAttribute(String(option.value ?? ""))}" data-custom-select-label="${escapeAttribute(option.label || "")}"${disabled}><span>${escapeHtml(option.label || "")}${detail}</span>${selected ? icon("check") : ""}</button>`;
  }).join("");
}

function customSelectAttributes(attributes = {}) {
  return Object.entries(attributes).map(([name, value]) => {
    if (value === false || value === null || value === undefined) return "";
    if (value === true) return ` ${name}`;
    return ` ${name}="${escapeAttribute(String(value))}"`;
  }).join("");
}

function bindCustomSelects(root = document) {
  root.querySelectorAll?.("[data-custom-select]").forEach((select) => {
    const trigger = select.querySelector("[data-custom-select-trigger]");
    if (trigger && !trigger.dataset.customSelectBound) {
      trigger.dataset.customSelectBound = "1";
      trigger.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleCustomSelect(select);
      });
      trigger.addEventListener("keydown", (event) => handleCustomSelectTriggerKeydown(event, select));
    }
    select.querySelectorAll("[data-custom-select-option]").forEach((option) => {
      if (option.dataset.customSelectBound) return;
      option.dataset.customSelectBound = "1";
      option.addEventListener("click", (event) => {
        event.stopPropagation();
        chooseCustomSelectOption(select, option);
      });
      option.addEventListener("keydown", (event) => handleCustomSelectOptionKeydown(event, select));
    });
  });
  bindCustomSelectDismiss();
}

function toggleCustomSelect(select, forceOpen) {
  const trigger = select.querySelector("[data-custom-select-trigger]");
  const menu = select.querySelector("[data-custom-select-menu]");
  if (!trigger || !menu || trigger.disabled) return;
  const open = forceOpen ?? menu.hidden;
  closeCustomSelects(select);
  menu.hidden = !open;
  select.classList.toggle("is-open", open);
  trigger.setAttribute("aria-expanded", String(open));
  if (open) {
    positionCustomSelect(select);
    const selected = menu.querySelector('[aria-selected="true"]');
    (selected || menu.querySelector("[data-custom-select-option]:not(:disabled)"))?.focus();
  }
  if (typeof scheduleTerminalLayoutSync === "function") scheduleTerminalLayoutSync();
}

function chooseCustomSelectOption(select, option) {
  if (option.disabled) return;
  const input = select.querySelector('input[type="hidden"]');
  if (!input) return;
  setCustomSelectValue(input, option.dataset.customSelectOption, true);
  toggleCustomSelect(select, false);
  select.querySelector("[data-custom-select-trigger]")?.focus();
}

function setCustomSelectValue(input, value, emit = false) {
  if (!input) return;
  const select = input.closest("[data-custom-select]");
  const next = String(value ?? "");
  input.value = next;
  let label = "";
  select?.querySelectorAll("[data-custom-select-option]").forEach((option) => {
    const selected = option.dataset.customSelectOption === next;
    option.classList.toggle("is-selected", selected);
    option.setAttribute("aria-selected", String(selected));
    option.querySelector(":scope > svg")?.remove();
    if (selected) {
      label = option.dataset.customSelectLabel || option.textContent.trim();
      option.insertAdjacentHTML("beforeend", icon("check"));
    }
  });
  const output = select?.querySelector("[data-custom-select-value]");
  if (output && label) output.textContent = label;
  if (emit) input.dispatchEvent(new Event("change", { bubbles: true }));
}

function updateCustomSelectOptions(input, options, value = input?.value) {
  const select = input?.closest("[data-custom-select]");
  const menu = select?.querySelector("[data-custom-select-menu]");
  if (!select || !menu) return;
  const normalized = Array.isArray(options) ? options : [];
  const next = normalized.some((option) => String(option.value) === String(value))
    ? String(value)
    : String(normalized[0]?.value ?? "");
  const signature = JSON.stringify(normalized.map((option) => [
    String(option.value ?? ""),
    String(option.label || ""),
    String(option.group || ""),
    Boolean(option.disabled)
  ]));
  if (menu.dataset.customSelectOptions !== signature) {
    menu.dataset.customSelectOptions = signature;
    menu.innerHTML = customSelectOptionsHtml(normalized, next);
    bindCustomSelects(select);
  }
  setCustomSelectValue(input, next);
}

function handleCustomSelectTriggerKeydown(event, select) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  toggleCustomSelect(select, true);
  const options = customSelectEnabledOptions(select);
  const target = event.key === "ArrowUp" || event.key === "End" ? options.at(-1) : options[0];
  target?.focus();
}

function handleCustomSelectOptionKeydown(event, select) {
  const options = customSelectEnabledOptions(select);
  const index = options.indexOf(event.currentTarget);
  if (event.key === "Escape") {
    event.preventDefault();
    toggleCustomSelect(select, false);
    select.querySelector("[data-custom-select-trigger]")?.focus();
    return;
  }
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    chooseCustomSelectOption(select, event.currentTarget);
    return;
  }
  const next = event.key === "ArrowDown" ? index + 1
    : event.key === "ArrowUp" ? index - 1
      : event.key === "Home" ? 0
        : event.key === "End" ? options.length - 1 : null;
  if (next === null) return;
  event.preventDefault();
  options[(next + options.length) % options.length]?.focus();
}

function customSelectEnabledOptions(select) {
  return Array.from(select.querySelectorAll("[data-custom-select-option]:not(:disabled)"));
}

function positionCustomSelect(select) {
  const menu = select.querySelector("[data-custom-select-menu]");
  const trigger = select.querySelector("[data-custom-select-trigger]");
  if (!menu || !trigger) return;
  select.classList.remove("opens-up");
  const triggerRect = trigger.getBoundingClientRect();
  const menuHeight = Math.min(menu.scrollHeight, 320);
  const below = window.innerHeight - triggerRect.bottom;
  select.classList.toggle("opens-up", below < menuHeight + 12 && triggerRect.top > below);
}

function closeCustomSelects(except = null) {
  document.querySelectorAll?.("[data-custom-select].is-open").forEach((select) => {
    if (select === except) return;
    select.classList.remove("is-open", "opens-up");
    const menu = select.querySelector("[data-custom-select-menu]");
    if (menu) menu.hidden = true;
    select.querySelector("[data-custom-select-trigger]")?.setAttribute("aria-expanded", "false");
  });
}

function bindCustomSelectDismiss() {
  if (customSelectDismissBound || typeof document === "undefined") return;
  customSelectDismissBound = true;
  document.addEventListener("click", (event) => {
    if (!event.target.closest?.("[data-custom-select]")) closeCustomSelects();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeCustomSelects();
  });
}
