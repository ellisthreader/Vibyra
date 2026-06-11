const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pickDesktopProjectPath } = require("./desktopProjectPicker.cjs");

test("native project picker supports folders and files", async () => {
  const calls = [];
  const dialog = {
    showOpenDialog: async (_window, options) => {
      calls.push(options);
      return { canceled: false, filePaths: [path.join(path.sep, "tmp", "project", "src", "App.tsx")] };
    }
  };

  const selected = await pickDesktopProjectPath(dialog, {}, "file");

  assert.equal(selected.canceled, false);
  assert.equal(selected.path, path.resolve(path.sep, "tmp", "project", "src", "App.tsx"));
  assert.deepEqual(calls[0].properties, ["openFile"]);
});

test("canceling the native project picker returns no path", async () => {
  const dialog = {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] })
  };

  assert.deepEqual(await pickDesktopProjectPath(dialog, {}, "folder"), {
    canceled: true,
    path: ""
  });
});
