# Desktop - Screenshot Capture

Read this for the system-wide F9 screenshot shortcut, native capture, editor,
and PNG export in Vibyra Desktop (`desktop-tauri/`).

## What A Capture Contains

- A capture is the pointer's monitor exactly as it looks, **Vibyra's own window
  included**. Hiding the window is opt-in through `screenshot_hide_window`
  (Settings - Folders - "Vibyra in captures"), defaults to `false`, and needs a
  compositing window manager to work at all.
- Because the window is in the shot, nothing may paint between the shortcut and
  the grab. `screenshotStore.capture()` invokes first and only then sets
  `draft`; `WorkspaceApp` mounts `ScreenshotEditor` on `draft !== null` alone.
  There is deliberately no "capturing" spinner - it would land in the PNG.
- The capture never resizes or fullscreens the window. The editor is a
  `position: fixed` overlay inside the existing window; forcing fullscreen used
  to re-lay-out and SIGWINCH every live terminal twice per capture.

## Rust/Tauri Performance Contract

- The desktop owns F9 in `desktop-tauri/src/lib/useGlobalShortcuts.ts` and
  captures through `src-tauri/src/commands/screenshot_capture.rs`.
- `screenshot_x11.rs` holds **one cached X11 connection** for every capture
  (grab, opacity, activate) and reopens it only after an error. Opening a
  connection per operation cost four handshakes per capture.
- `capture_screen` returns one raw Tauri binary body: `VSH\x01`, big-endian
  width/height, then RGBA pixels. `src/lib/screenshotCapture.ts` validates the
  exact body size and copies the borrowed IPC bytes into renderer-owned memory.

## Editor Rendering Contract

- The stage has **two stacked layers**, both sized to the space they occupy
  (`src/lib/screenshotView.ts`), never to the capture resolution: a CSS-scaled
  2-megapixel canvas makes the compositor resample the whole layer per frame,
  which is what made dragging stutter on the software-composited WebKit path
  (see [[Rust Tauri Desktop]] for when that path is chosen).
  - image layer - repainted only when the document canvas changes;
  - overlay layer - transparent, holds the crop chrome and the in-progress
    stroke, and is the only thing repainted while dragging. `drawCrop` punches
    the selection out with `clearRect` instead of re-blitting the capture.
- `useScreenshotLayers.ts` owns both layers, the `ResizeObserver`, and the
  rAF-coalesced overlay repaint. `useScreenshotPointer.ts` maps pointer events
  through a rect cached on drag start - reading `getBoundingClientRect` per
  pointer move forced a synchronous layout on every mouse move.
- Overlay drawing happens in document coordinates under a `scale` transform, so
  a preview and the committed operation are pixel-identical.
- `body.screenshot-editing` hides the workspace with `visibility: hidden`:
  layout is preserved (nothing reflows on the way in or out) but live terminals
  stop painting under an opaque overlay.
- Copy/Save PNG export still runs at full capture resolution through
  asynchronous `canvas.toBlob` in `screenshotOperations.ts`.

## Validation

- Focused checks are `npm --prefix desktop-tauri test` (see
  `tests/screenshotView.test.mjs`), `npm --prefix desktop-tauri run build`,
  `cargo check`/`clippy`, `npm run lines`, and a real F9 capture from outside
  Vibyra. All screenshot source files remain at or below 200 lines.
- Timing target: the editor is up within ~150 ms of F9 at 1080p with the window
  included, and a crop drag holds 60 fps on the shared-memory renderer.
