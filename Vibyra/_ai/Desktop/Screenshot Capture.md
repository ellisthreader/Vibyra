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
  registration, PNG validation, clipboard, and save dialog.
- `desktop/electron-main.cjs`: lifecycle, overlap guard, renderer event, and IPC.
- `desktop/lib/electronReload.cjs`: real relaunch when main-process sources
  change.
- `desktop/electron-preload.cjs`: narrow screenshot event/Copy/Save API.
- `desktop/assets/app.screenshot-*.js`: native-resolution editor state, tools,
  view, and runtime.
- `desktop/assets/app.screenshot*.css`: full-window responsive visual system.

## Validation

Run:

```bash
node --test desktop/lib/desktopScreenshot.test.cjs \
  desktop/electron-main.test.mjs \
  desktop/assets/app.screenshot.test.mjs
```

Also render the editor at desktop and 700px widths. Apply crop must remain
hidden until a valid crop exists.
