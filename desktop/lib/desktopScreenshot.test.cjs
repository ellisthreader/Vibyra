const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createDesktopScreenshot,
  timestampedPngName
} = require("./desktopScreenshot.cjs");

function createMocks(overrides = {}) {
  const calls = { clipboard: [], dialogs: [], registered: [], unregistered: [], writes: [] };
  const image = { isEmpty: () => false };
  const display = { id: 42, size: { width: 1440, height: 900 }, scaleFactor: 2 };
  const thumbnail = {
    isEmpty: () => false,
    toPNG: () => Buffer.from("png bytes")
  };
  const dependencies = {
    clipboard: { writeImage: (value) => calls.clipboard.push(value) },
    desktopCapturer: {
      getSources: async (options) => {
        calls.captureOptions = options;
        return [{ display_id: "42", thumbnail }];
      }
    },
    dialog: {
      showSaveDialog: async (...args) => {
        calls.dialogs.push(args);
        return { canceled: false, filePath: "/tmp/screenshot.png" };
      }
    },
    globalShortcut: {
      register: (key, handler) => {
        calls.registered.push(key);
        calls.shortcutHandler = handler;
        return true;
      },
      unregister: (key) => calls.unregistered.push(key)
    },
    nativeImage: {
      createFromDataURL: (dataUrl) => {
        calls.decodedDataUrl = dataUrl;
        return image;
      }
    },
    screen: {
      getCursorScreenPoint: () => ({ x: 1500, y: 400 }),
      getDisplayNearestPoint: (point) => {
        calls.cursorPoint = point;
        return display;
      }
    },
    now: () => new Date("2026-06-10T14:05:09.123Z"),
    screenAccessStatus: () => "granted",
    writeFile: async (filePath, contents) => calls.writes.push([filePath, contents]),
    ...overrides
  };
  return { calls, dependencies, display, image };
}

test("selects the display under the cursor and captures it at physical resolution", async () => {
  const { calls, dependencies, display } = createMocks();
  const screenshots = createDesktopScreenshot(dependencies);

  const result = await screenshots.captureDisplay();

  assert.equal(result.display, display);
  assert.equal(result.dataUrl, "data:image/png;base64,cG5nIGJ5dGVz");
  assert.deepEqual(calls.cursorPoint, { x: 1500, y: 400 });
  assert.deepEqual(calls.captureOptions, {
    types: ["screen"],
    thumbnailSize: { width: 2880, height: 1800 },
    fetchWindowIcons: false
  });
});

test("copies PNG data URLs through Electron nativeImage and clipboard", () => {
  const { calls, dependencies, image } = createMocks();
  const screenshots = createDesktopScreenshot(dependencies);
  const dataUrl = "data:image/png;base64,cG5n";

  screenshots.copyPngDataUrl(dataUrl);

  assert.equal(calls.decodedDataUrl, dataUrl);
  assert.deepEqual(calls.clipboard, [image]);
  assert.throws(() => screenshots.copyPngDataUrl("data:image/jpeg;base64,eA=="), {
    name: "TypeError"
  });
  assert.throws(() => screenshots.copyPngDataUrl("data:image/png;base64,not valid"), {
    name: "TypeError"
  });
});

test("uses the single portal source and explains denied macOS access", async () => {
  const portal = createMocks({
    desktopCapturer: {
      getSources: async () => [{
        display_id: "",
        thumbnail: { isEmpty: () => false, toPNG: () => Buffer.from("portal") }
      }]
    }
  });
  assert.match(
    (await createDesktopScreenshot(portal.dependencies).captureDisplay()).dataUrl,
    /cG9ydGFs$/
  );

  const denied = createMocks({ screenAccessStatus: () => "denied" });
  await assert.rejects(
    createDesktopScreenshot(denied.dependencies).captureDisplay(),
    /Privacy & Security > Screen Recording/
  );
});

test("registers a real F9 shortcut once and unregisters only after success", async () => {
  let presses = 0;
  const { calls, dependencies } = createMocks();
  const screenshots = createDesktopScreenshot(dependencies);

  assert.equal(screenshots.registerF9Shortcut(() => { presses += 1; }), true);
  assert.equal(screenshots.registerF9Shortcut(), true);
  calls.shortcutHandler();
  await Promise.resolve();
  screenshots.unregisterF9Shortcut();
  screenshots.unregisterF9Shortcut();

  assert.equal(presses, 1);
  assert.deepEqual(calls.registered, ["F9"]);
  assert.deepEqual(calls.unregistered, ["F9"]);
});

test("does not unregister F9 when Electron rejects registration", () => {
  const { calls, dependencies } = createMocks({
    globalShortcut: {
      register: (key) => {
        calls.registered.push(key);
        return false;
      },
      unregister: (key) => calls.unregistered.push(key)
    }
  });
  const screenshots = createDesktopScreenshot(dependencies);

  assert.equal(screenshots.registerF9Shortcut(), false);
  screenshots.unregisterF9Shortcut();

  assert.deepEqual(calls.registered, ["F9"]);
  assert.deepEqual(calls.unregistered, []);
});

test("default F9 action captures and copies the display under the cursor", async () => {
  const { calls, dependencies } = createMocks();
  const screenshots = createDesktopScreenshot(dependencies);

  screenshots.registerF9Shortcut();
  calls.shortcutHandler();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.clipboard.length, 1);
  assert.equal(calls.decodedDataUrl, "data:image/png;base64,cG5nIGJ5dGVz");
});

test("save dialog uses a timestamped PNG default and writes decoded bytes", async () => {
  const parent = { id: "main-window" };
  const { calls, dependencies } = createMocks({ getParentWindow: () => parent });
  const screenshots = createDesktopScreenshot(dependencies);

  const result = await screenshots.savePngDataUrl("data:image/png;base64,c2F2ZWQ=");

  assert.deepEqual(result, { canceled: false, filePath: "/tmp/screenshot.png" });
  assert.equal(calls.dialogs[0][0], parent);
  assert.equal(
    calls.dialogs[0][1].defaultPath,
    "Vibyra-Screenshot-2026-06-10-14-05-09Z.png"
  );
  assert.equal(calls.writes[0][0], "/tmp/screenshot.png");
  assert.equal(calls.writes[0][1].toString(), "saved");
});

test("save cancellation does not write a file", async () => {
  const { calls, dependencies } = createMocks({
    dialog: { showSaveDialog: async () => ({ canceled: true }) }
  });
  const screenshots = createDesktopScreenshot(dependencies);

  assert.deepEqual(await screenshots.savePngDataUrl("data:image/png;base64,eA=="), {
    canceled: true
  });
  assert.deepEqual(calls.writes, []);
});

test("timestamped filename is deterministic", () => {
  assert.equal(
    timestampedPngName(new Date("2026-01-02T03:04:05.999Z")),
    "Vibyra-Screenshot-2026-01-02-03-04-05Z.png"
  );
});
