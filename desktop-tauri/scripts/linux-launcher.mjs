import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Desktop Entry Exec quoting has two escape passes and treats % as a field
// code even inside quotes; a shell quote or JSON string is not sufficient.
export function desktopExec(path) {
  if (/[\r\n\0]/.test(path)) throw new Error("The AppImage path contains an invalid control character.");
  return `"${path.replace(/\\/g, "\\\\\\\\").replace(/["`$]/g, "\\\\$&").replace(/%/g, "%%")}"`;
}

export function installLinuxLauncher({ root, destination, dataHome = process.env.XDG_DATA_HOME || join(homedir(), ".local/share") }) {
  const applications = join(dataHome, "applications");
  const icons = join(dataHome, "icons/hicolor/256x256/apps");
  mkdirSync(applications, { recursive: true });
  mkdirSync(icons, { recursive: true });
  copyFileSync(join(root, "src-tauri/icons/128x128@2x.png"), join(icons, "vibyra.png"));
  const launcher = join(applications, "vibyra.desktop");
  writeFileSync(launcher, [
    "[Desktop Entry]", "Type=Application", "Name=Vibyra", "Comment=Vibyra AI terminal workspace",
    `Exec=${desktopExec(destination)}`, "Icon=vibyra", "Terminal=false",
    "Categories=Development;", "StartupWMClass=Vibyra", "StartupNotify=true", "",
  ].join("\n"));
  spawnSync("update-desktop-database", [applications], { stdio: "ignore" });
  spawnSync("gtk-update-icon-cache", ["-f", "-t", join(dataHome, "icons/hicolor")], { stdio: "ignore" });
  return launcher;
}
