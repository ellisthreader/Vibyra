const test = require("node:test");
const assert = require("node:assert/strict");
const { createDesktopScreenshotSettings, validDirectory } = require("./desktopScreenshotSettings.cjs");

function createSettings(overrides = {}) {
  const calls = { mkdir: [], rename: [], remove: [], write: [] };
  const files = new Map();
  const app = {
    getPath: (key) => key === "home" ? "/home/ellis" : "/config/vibyra"
  };
  const dependencies = {
    app,
    dialog: {
      showOpenDialog: async () => ({
        canceled: false,
        filePaths: ["/home/ellis/Pictures/Captures"]
      })
    },
    mkdirSync: (...args) => calls.mkdir.push(args),
    readFileSync: (filePath) => {
      if (!files.has(filePath)) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return files.get(filePath);
    },
    renameSync: (from, to) => {
      calls.rename.push([from, to]);
      files.set(to, files.get(from));
      files.delete(from);
    },
    rmSync: (filePath, options) => {
      calls.remove.push([filePath, options]);
      files.delete(filePath);
    },
    writeFileSync: (filePath, contents, options) => {
      calls.write.push([filePath, contents, options]);
      files.set(filePath, contents);
    },
    ...overrides
  };
  return { calls, dependencies, files };
}

test("uses the default folder until a custom screenshot folder is chosen", async () => {
  const { calls, dependencies } = createSettings();
  const settings = createDesktopScreenshotSettings(dependencies);

  assert.deepEqual(settings.state(), {
    directory: "/home/ellis/.vibyra-desktop/screenshots",
    defaultDirectory: "/home/ellis/.vibyra-desktop/screenshots",
    isCustom: false
  });

  const chosen = await settings.choose({ id: "window" });

  assert.equal(chosen.directory, "/home/ellis/Pictures/Captures");
  assert.equal(chosen.isCustom, true);
  assert.equal(settings.directory(), "/home/ellis/Pictures/Captures");
  assert.deepEqual(calls.mkdir, [["/config/vibyra", { recursive: true }]]);
  assert.equal(calls.write[0][2].mode, 0o600);
  assert.deepEqual(calls.rename, [[
    "/config/vibyra/screenshot-settings.json.tmp",
    "/config/vibyra/screenshot-settings.json"
  ]]);
});

test("loads a persisted folder and reset removes only the setting", () => {
  const { calls, dependencies, files } = createSettings();
  files.set(
    "/config/vibyra/screenshot-settings.json",
    JSON.stringify({ directory: "/mnt/photos/Vibyra" })
  );
  const settings = createDesktopScreenshotSettings(dependencies);

  assert.equal(settings.directory(), "/mnt/photos/Vibyra");
  assert.equal(settings.state().isCustom, true);
  assert.equal(settings.reset().directory, "/home/ellis/.vibyra-desktop/screenshots");
  assert.deepEqual(calls.remove, [[
    "/config/vibyra/screenshot-settings.json",
    { force: true }
  ]]);
});

test("canceling the picker keeps the current folder and relative paths are rejected", async () => {
  const { dependencies } = createSettings({
    dialog: {
      showOpenDialog: async () => ({ canceled: true, filePaths: [] })
    }
  });
  const settings = createDesktopScreenshotSettings(dependencies);

  assert.equal((await settings.choose()).canceled, true);
  assert.equal(settings.state().isCustom, false);
  assert.equal(validDirectory("../screenshots"), "");
  assert.equal(validDirectory("/tmp/screenshots"), "/tmp/screenshots");
});
