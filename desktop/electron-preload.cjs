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

contextBridge.exposeInMainWorld("vibyraDesktopScreenshot", {
  isElectron: true,
  copy: (dataUrl) => ipcRenderer.invoke("screenshot:copy", dataUrl),
  save: (dataUrl) => ipcRenderer.invoke("screenshot:save", dataUrl),
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
