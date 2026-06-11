const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createDesktopScreenshot,
  shellQuotedPath,
  timestampedPngName
} = require("./desktopScreenshot.cjs");

function createMocks(overrides = {}) {
  const calls = { clipboard: [], dialogs: [], registered: [], unregistered: [], writes: [] };
  const thumbnailImage = { toDataURL: () => "data:image/png;base64,dGh1bWI=" };
  const image = {
    getSize: () => ({ width: 1920, height: 1080 }),
    isEmpty: () => false,
    resize: (options) => {
      calls.resizeOptions = options;
      return thumbnailImage;
    }
  };
  const display = { id: 42, size: { width: 1440, height: 900 }, scaleFactor: 2 };
  const thumbnail = {
    isEmpty: () => false,
    toPNG: () => Buffer.from("png bytes")
  };
  const dependencies = {
    clipboard: {
      write: (value) => calls.clipboard.push(value),
      writeImage: (value) => calls.clipboard.push(value)
    },
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
      createFromBuffer: (buffer) => {
        calls.decodedBuffer = buffer;
        return image;
      },
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
    getScreenshotsDirectory: () => "/tmp/vibyra-screenshots",
    mkdir: async (...args) => { calls.mkdir = args; },
    readFile: async () => Buffer.from("recent"),
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

test("copies the original saved screenshot and rejects paths outside the library", async () => {
  const { calls, dependencies, image } = createMocks({
    readFile: async (filePath) => Buffer.from(filePath)
  });
  const screenshots = createDesktopScreenshot(dependencies);

  await screenshots.copySavedScreenshot("/tmp/vibyra-screenshots/original.png");

  assert.equal(calls.decodedBuffer.toString(), "/tmp/vibyra-screenshots/original.png");
  assert.deepEqual(calls.clipboard, [{
    image,
    text: "'/tmp/vibyra-screenshots/original.png'"
  }]);
  await assert.rejects(
    screenshots.copySavedScreenshot("/tmp/other.png"),
    /outside the Vibyra screenshot library/
  );
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

test("save writes to the Vibyra screenshot library and returns tray metadata", async () => {
  const { calls, dependencies } = createMocks();
  const screenshots = createDesktopScreenshot(dependencies);

  const result = await screenshots.savePngDataUrl("data:image/png;base64,c2F2ZWQ=");

  assert.equal(result.filePath, "/tmp/vibyra-screenshots/Vibyra-Screenshot-2026-06-10-14-05-09-123Z.png");
  assert.equal(result.name, "Vibyra-Screenshot-2026-06-10-14-05-09-123Z.png");
  assert.equal(result.thumbnailDataUrl, "data:image/png;base64,dGh1bWI=");
  assert.deepEqual(calls.mkdir, ["/tmp/vibyra-screenshots", { recursive: true }]);
  assert.equal(calls.writes[0][0], result.filePath);
  assert.equal(calls.writes[0][1].toString(), "saved");
  assert.deepEqual(calls.resizeOptions, { width: 320, quality: "good" });
});

test("timestamped filename is deterministic", () => {
  assert.equal(
    timestampedPngName(new Date("2026-01-02T03:04:05.999Z")),
    "Vibyra-Screenshot-2026-01-02-03-04-05-999Z.png"
  );
});

test("saved screenshot paths are shell-safe", () => {
  assert.equal(
    shellQuotedPath("/tmp/user's screenshots/$capture.png"),
    "'/tmp/user'\\''s screenshots/$capture.png'"
  );
});
