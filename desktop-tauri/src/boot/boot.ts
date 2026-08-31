import { listen } from "@tauri-apps/api/event";

import { bootView, type BootSignal } from "./bootState";

// The boot window's whole runtime. It renders one line of text and one rail,
// and it is driven entirely from Rust — there is no state here to get out of
// sync, and nothing it can do to stop the app opening.
//
// Deliberately not React: this bundle is parsed before the app bundle exists,
// and a framework would cost more than everything it renders.

/** Rust emits this on every phase change; see `src-tauri/src/boot_window.rs`. */
const PHASE_EVENT = "boot://phase";

const statusEl = document.getElementById("boot-status");
const fillEl = document.getElementById("boot-fill");

/** Restarting a CSS animation needs the class gone for a layout pass, not
 * merely reassigned — reading `offsetWidth` is what forces that pass. */
function replay(element: HTMLElement, className: string): void {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

function render(signal: BootSignal): void {
  const view = bootView(signal);

  if (statusEl && statusEl.textContent?.trim() !== view.status) {
    statusEl.textContent = view.status;
    replay(statusEl, "boot__status");
  }

  if (!fillEl) return;
  fillEl.classList.toggle("boot__fill--sweep", !view.determinate);
  fillEl.classList.toggle("boot__fill--measured", view.determinate);
  fillEl.style.setProperty("--boot-percent", `${view.percent}%`);
}

// A payload from a future host build could carry a phase this bundle does not
// know. Rendering nothing would leave the window frozen on its last line, so
// an unrecognised phase is dropped and the previous one stays — which is at
// least true, and still moving.
const KNOWN: ReadonlySet<string> = new Set<BootSignal["phase"]>([
  "starting",
  "checking",
  "downloading",
  "installing",
  "launching",
  "failed",
]);

void listen<BootSignal>(PHASE_EVENT, (event) => {
  if (KNOWN.has(event.payload?.phase)) render(event.payload);
});
