const path = require("node:path");

async function pickDesktopProjectPath(dialog, window, kind = "folder") {
  const file = kind === "file";
  const result = await dialog.showOpenDialog(window, {
    title: file ? "Choose a file inside your project" : "Choose a project folder",
    buttonLabel: file ? "Use file location" : "Use this folder",
    properties: file ? ["openFile"] : ["openDirectory", "createDirectory"]
  });
  if (result.canceled || !result.filePaths.length) {
    return { canceled: true, path: "" };
  }
  return {
    canceled: false,
    path: path.resolve(result.filePaths[0])
  };
}

module.exports = { pickDesktopProjectPath };
