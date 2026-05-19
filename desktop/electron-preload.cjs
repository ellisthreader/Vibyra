const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vibyraDesktopWindow", {
  isElectron: true,
  close: () => ipcRenderer.invoke("window:close"),
  maximize: () => ipcRenderer.invoke("window:maximize"),
  minimize: () => ipcRenderer.invoke("window:minimize")
});
