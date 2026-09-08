const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const ignoredRoots = [
  ".agents",
  ".git",
  ".vibyra-agent",
  "Vibyra",
  "backend",
  "desktop",
  "desktop-tauri",
  "docs",
  "tmp"
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

config.resolver.blockList = ignoredRoots.map((directory) => {
  const root = escapeRegex(path.resolve(__dirname, directory));
  return new RegExp(`^${root}(?:[/\\\\].*)?$`);
});

module.exports = config;
