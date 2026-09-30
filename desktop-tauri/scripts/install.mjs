// Keep the normal build/install command pointed at the app this OS opens.
if (process.platform === "darwin") {
  await import("./install-macos.mjs");
} else if (process.platform === "linux") {
  await import("./install-linux.mjs");
} else {
  throw new Error("Use npm run app:build:windows on Windows.");
}
