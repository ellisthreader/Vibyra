const modalStack = [];
let modalBackgroundState = [];
const modalFocusableSelector = [
  "button:not([disabled])", "a[href]", "input:not([disabled])",
  "select:not([disabled])", "textarea:not([disabled])",
  "[contenteditable='true']", "[tabindex]:not([tabindex='-1'])"
].join(",");

function modalBackgroundElements() {
  return [document.querySelector(".app"), document.getElementById("mobile-dock")].filter(Boolean);
}

function setModalElementHidden(element, hidden) {
  element.inert = hidden;
  if (hidden) element.setAttribute("aria-hidden", "true");
  else element.removeAttribute("aria-hidden");
}

function syncModalLayers() {
  const top = modalStack.at(-1)?.modal;
  modalStack.forEach(({ modal }) => setModalElementHidden(modal, modal !== top));
}

function focusableModalElements(modal) {
  return Array.from(modal.querySelectorAll(modalFocusableSelector))
    .filter((element) => !element.hidden
      && element.getAttribute("aria-hidden") !== "true"
      && (!element.getClientRects || element.getClientRects().length));
}

function focusModal(modal) {
  if (modalStack.at(-1)?.modal !== modal) return;
  const preferred = modal.querySelector("[data-modal-close], .modal-header button");
  (preferred || focusableModalElements(modal)[0] || modal.querySelector(".modal"))?.focus();
}

function showModal(modal, close, opener = document.activeElement, fallbackOpener = null) {
  if (modalStack.some((entry) => entry.modal === modal)) return;
  if (!modalStack.length) {
    modalBackgroundState = modalBackgroundElements().map((element) => ({
      element,
      inert: element.inert,
      ariaHidden: element.getAttribute("aria-hidden")
    }));
    modalBackgroundState.forEach(({ element }) => setModalElementHidden(element, true));
  }
  modal.classList.add("open");
  modalStack.push({ modal, close, opener, fallbackOpener });
  syncModalLayers();
  requestAnimationFrame(() => focusModal(modal));
}

function hideModal(modal) {
  const index = modalStack.findIndex((entry) => entry.modal === modal);
  if (index < 0) return;
  const [entry] = modalStack.splice(index, 1);
  modal.classList.remove("open");
  setModalElementHidden(modal, true);
  if (modalStack.length) syncModalLayers();
  else restoreModalBackground();
  if (index !== modalStack.length) return;
  const restoreTarget = entry.opener?.isConnected ? entry.opener : entry.fallbackOpener;
  if (restoreTarget?.isConnected) restoreTarget.focus();
  else if (modalStack.length) focusModal(modalStack.at(-1).modal);
}

function restoreModalBackground() {
  modalBackgroundState.forEach(({ element, inert, ariaHidden }) => {
    element.inert = inert;
    if (ariaHidden === null) element.removeAttribute("aria-hidden");
    else element.setAttribute("aria-hidden", ariaHidden);
  });
  modalBackgroundState = [];
}

function handleModalKeydown(event) {
  const entry = modalStack.at(-1);
  if (!entry) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    entry.close();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = focusableModalElements(entry.modal);
  if (!focusable.length) {
    event.preventDefault();
    focusModal(entry.modal);
    return;
  }
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !entry.modal.contains(document.activeElement))) {
    event.preventDefault();
    first.focus();
  }
}

document.addEventListener("keydown", handleModalKeydown);

globalThis.__vibyraModalLifecycle = {
  close: hideModal,
  handleKeydown: handleModalKeydown,
  open: showModal,
  stack: modalStack
};
