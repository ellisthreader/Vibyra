# Desktop - Screenshot Capture

Read this for the system-wide screenshot shortcut, native capture, editor, and
PNG export.

## Contract

- `F9` is registered through Electron `globalShortcut`, so it works while
  Vibyra is running but hidden or another app has focus.
- Capture is user-initiated and local. Pressing `F9` captures the display under
  the pointer; nothing is uploaded or written until explicit Copy or Save.
- Capture happens before Vibyra is revealed. The renderer then opens a
  full-window editor with Crop, Box, Pen, undo, reset, Copy, and Save.
- Only one screenshot editor session may exist at a time. Main must ignore F9
  while native capture is pending or the editor is open, and the renderer
  reports editor open/closed state through the narrow preload bridge. Reset the
  main-process lock when the renderer reloads, exits, or the window closes.
- Save auto-applies any pending crop and writes a uniquely timestamped PNG to
  the configured screenshot folder. The default is
  `~/.vibyra-desktop/screenshots/`; Settings > Preferences > Screenshots
  provides a native folder picker and a one-click reset to the default. It
  closes the editor and publishes the newest saved item in a fixed bottom-left
  tray that remains visible across Home, Chat, Projects, Terminals, Profile,
  and auth rendering.
- The saved tray is only a quiet screenshot thumbnail box with a Copy icon in
  the top-left and an X in the top-right. Do not add saved-status text,
  filenames, labels, or other chrome. Multiple captures render as separate
  cards in one vertical bottom-left stack, with the newest nearest the bottom;
  never arrange them side by side. Each card reveals, copies, and dismisses
  only its own screenshot. Dragging the thumbnail publishes the shell-safe
  quoted absolute PNG path as both `text/plain` and the private
  `application/x-vibyra-screenshot-path` drag type. Do not use
  `webContents.startDrag()` for this interaction: Electron native file drag is
  for OS file destinations, cancels the browser drag payload, and cannot
  guarantee path text insertion. Vibyra Chat appends the private path payload
  to its composer. A Vibyra terminal drops it through `xterm.paste()`, preserving
  the single `xterm.onData` owner and never adding Enter. Ordinary external
  image drops still stage bounded image data for chat. Copy reads the original
  saved PNG through a guarded native path and
  writes a dual-format native clipboard payload:
  full-resolution PNG for image-aware chats plus the shell-safe quoted absolute
  file path as text so xterm/PTY terminals can paste and reference the image.
  After a successful tray copy, the icon changes to a checkmark with a subtle
  scale/draw animation, exposes `Screenshot copied` to assistive technology,
  and restores the copy icon after 1.4 seconds. Keep the existing button colors.
  Copy failures retain the existing notice path and must not show success
  feedback. Reduced-motion users keep the checkmark without animation.
  Clicking the image reveals only files inside the currently configured
  screenshot directory. X dismisses only the current card and does not delete
  the saved PNG. Tray cards are renderer-session state only: renderer reloads
  and app restarts start with an empty tray and must never enumerate or restore
  older PNGs from disk.
- The main process owns the screenshot folder setting through
  `desktopScreenshotSettings.cjs`, persists only a validated absolute custom
  path in Electron user data, and resolves the active directory for every
  Save, Copy, and Reveal request. Changing or resetting the directory clears
  the current tray so cards cannot retain paths outside the new guarded root.
- Apply changes commits a pending crop without closing. The editor X and Escape
  explicitly hide both `.screenshot-editor` and `.screenshot-editor-host`.
  Close is idempotent: every invocation must remove `body.screenshot-editing`
  and clear editor state even when the root is already hidden. Increment a
  renderer generation on open and close, and commit an asynchronously decoded
  image only while its generation is current and the editor remains visible.
  This prevents rapid F9 plus repeated X/Escape from allowing a late image load
  to restore or trap the full-window overlay.
- The editor is the app's highest interaction layer (`z-index: 1000`) and its
  host, controls, and canvas explicitly use `-webkit-app-region: no-drag`.
  Vibyra's frameless title bar otherwise treats top-row Close, Crop, Box, Pen,
  color, undo, and reset input as window dragging. Keep the editor above
  terminal model/project menus, which currently reach z-index 320-340.
- Crop/annotation coordinates stay at native image resolution. Full-resolution
  PNG undo history is bounded to six states.
- Linux enables `GlobalShortcutsPortal`; a single portal-provided source is a
  valid capture fallback. macOS denied/restricted screen access must explain
  the Screen Recording setting and restart requirement.
- Electron close hides the window, and a second launch normally targets the
  existing single instance. Main/preload/helper source changes therefore use
  `watchDesktopMainSources()` to call `app.relaunch()`; a renderer-only reload
  cannot install a new global shortcut.
- The launcher appends Electron output to
  `~/.vibyra-desktop/electron.log`. Successful startup records
  `Vibyra screenshot shortcut registered: F9`; live capture records the request
  and the display opened in the editor.

## Ownership

- `desktop/lib/desktopScreenshot.cjs`: display selection, capture, F9
  registration, PNG validation, clipboard, and PNG save.
- `desktop/lib/desktopScreenshotSettings.cjs`: default/custom folder
  resolution, native folder picker, validation, and persisted setting.
- `desktop/electron-main.cjs`: lifecycle, overlap guard, renderer event, and IPC.
- `desktop/lib/electronReload.cjs`: real relaunch when main-process sources
  change.
- `desktop/electron-preload.cjs`: narrow screenshot event/Copy/Save API.
- `desktop/assets/app.screenshot-*.js`: native-resolution editor state, tools,
  view, and runtime.
- `desktop/assets/app.screenshot-tray.js`: recent saved capture state, reveal,
  dismiss, and cross-screen rendering.
- `desktop/assets/app.profile-screenshots.js`: Preferences folder row, picker,
  reset action, and current-directory display.
- `desktop/assets/app.chat-attachments.js`: file-picker and composer-drop image
  staging plus screenshot-path insertion for desktop chat.
- `desktop/assets/app.terminals-path-drop.js`: private screenshot path drop
  recognition and one-time xterm paste.
- `desktop/assets/app.screenshot*.css`: full-window responsive visual system.

## Validation

Run:

```bash
node --test desktop/lib/desktopScreenshot.test.cjs \
  desktop/lib/desktopScreenshotSettings.test.cjs \
  desktop/electron-main.test.mjs \
  desktop/assets/app.screenshot.test.mjs
```

Also render the editor at desktop and 700px widths. Apply crop must remain
hidden until a valid crop exists. On Linux, a tray Copy should expose both
`image/png` and `text/plain` clipboard targets; the text must resolve to the
same saved PNG. Live drag acceptance requires dropping on the terminal prompt
surface; verify that the quoted path appears once and Enter is not submitted.
Stress the lifecycle by pressing F9 rapidly at least 20 times, then repeatedly
closing the editor. Exactly one editor should appear, the shell must remain
usable after close, and a subsequent single F9 must open a fresh editor.
On Electron, click every top-row control rather than validating only keyboard
shortcuts; confirm the window does not move or hide. Draw once with Pen and Box,
then verify Apply, Copy, Save, X, and Escape.
In Settings > Preferences, choose a temporary folder, save a screenshot, and
confirm the PNG is written there. Reload the renderer and restart Electron:
the PNG must remain on disk but no saved screenshot card may reappear. Reset
the folder and confirm the displayed path returns to the default.
