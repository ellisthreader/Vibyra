const {
  mkdirSync: defaultMkdirSync,
  readFileSync: defaultReadFileSync,
  renameSync: defaultRenameSync,
  rmSync: defaultRmSync,
  writeFileSync: defaultWriteFileSync
} = require("node:fs");
const path = require("node:path");

function createDesktopScreenshotSettings(dependencies) {
  const {
    app,
    dialog,
    mkdirSync = defaultMkdirSync,
    readFileSync = defaultReadFileSync,
    renameSync = defaultRenameSync,
    rmSync = defaultRmSync,
    writeFileSync = defaultWriteFileSync
  } = dependencies;
  let customDirectory = loadCustomDirectory();

  function defaultDirectory() {
    return path.join(app.getPath("home"), ".vibyra-desktop", "screenshots");
  }

  function settingsPath() {
    return path.join(app.getPath("userData"), "screenshot-settings.json");
  }

  function loadCustomDirectory() {
    try {
      const parsed = JSON.parse(readFileSync(settingsPath(), "utf8"));
      return validDirectory(parsed?.directory);
    } catch {
      return "";
    }
  }

  function state() {
    const fallback = defaultDirectory();
    return {
      directory: customDirectory || fallback,
      defaultDirectory: fallback,
      isCustom: Boolean(customDirectory)
    };
  }

  async function choose(parentWindow) {
    const result = await dialog.showOpenDialog(parentWindow, {
      title: "Choose screenshot folder",
      buttonLabel: "Use this folder",
      defaultPath: state().directory,
      properties: ["openDirectory", "createDirectory"]
    });
    if (result.canceled || !result.filePaths?.length) {
      return { canceled: true, ...state() };
    }
    const directory = validDirectory(result.filePaths[0]);
    if (!directory) throw new Error("Choose a valid screenshot folder.");
    customDirectory = directory;
    persist();
    return { canceled: false, ...state() };
  }

  function reset() {
    customDirectory = "";
    try {
      rmSync(settingsPath(), { force: true });
    } catch {}
    return state();
  }

  function persist() {
    const filePath = settingsPath();
    const temporaryPath = `${filePath}.tmp`;
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(temporaryPath, `${JSON.stringify({ directory: customDirectory }, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporaryPath, filePath);
  }

  return {
    choose,
    directory: () => state().directory,
    reset,
    state
  };
}

function validDirectory(value) {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) return "";
  const directory = path.normalize(value.trim());
  return path.isAbsolute(directory) ? directory : "";
}

module.exports = { createDesktopScreenshotSettings, validDirectory };
