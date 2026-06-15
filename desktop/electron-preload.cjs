const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vibyraDesktopWindow", {
  isElectron: true,
  close: () => ipcRenderer.invoke("window:close"),
  maximize: () => ipcRenderer.invoke("window:maximize"),
  minimize: () => ipcRenderer.invoke("window:minimize")
});

contextBridge.exposeInMainWorld("vibyraDesktopMemory", {
  pick: (kind) => ipcRenderer.invoke("memory:pick", kind),
  discoverObsidian: () => ipcRenderer.invoke("memory:discover-obsidian"),
  importDiscoveredVault: (id) => ipcRenderer.invoke("memory:import-discovered-vault", id)
});

contextBridge.exposeInMainWorld("vibyraDesktopProjects", {
  pick: (kind) => ipcRenderer.invoke("projects:pick", kind)
});

contextBridge.exposeInMainWorld("vibyraDesktopClipboard", {
  writeText: (text) => ipcRenderer.invoke("clipboard:write-text", String(text || ""))
});

contextBridge.exposeInMainWorld("vibyraDesktopScreenshot", {
  isElectron: true,
  chooseDirectory: () => ipcRenderer.invoke("screenshot:choose-directory"),
  copy: (dataUrl) => ipcRenderer.invoke("screenshot:copy", dataUrl),
  copySaved: (filePath) => ipcRenderer.invoke("screenshot:copy-saved", filePath),
  getSettings: () => ipcRenderer.invoke("screenshot:settings"),
  resetDirectory: () => ipcRenderer.invoke("screenshot:reset-directory"),
  reveal: (filePath) => ipcRenderer.invoke("screenshot:reveal", filePath),
  save: (dataUrl) => ipcRenderer.invoke("screenshot:save", dataUrl),
  setEditorOpen: (open) => ipcRenderer.send("screenshot:editor-state", open === true),
  onCapture: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on("screenshot:captured", handler);
    return () => ipcRenderer.removeListener("screenshot:captured", handler);
  },
  onError: (listener) => {
    const handler = (_event, message) => listener(message);
    ipcRenderer.on("screenshot:error", handler);
    return () => ipcRenderer.removeListener("screenshot:error", handler);
  }
});
