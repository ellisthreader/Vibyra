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
