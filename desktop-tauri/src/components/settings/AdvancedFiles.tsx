import { open as openDialog } from "@tauri-apps/plugin-dialog";

import { shortcutLabel } from "../../lib/hotkeys";
import { isMac } from "../../lib/platform";
import { SettingRow, Switch, type SettingsPaneProps } from "./SettingsShared";

async function pickFolder(title: string, current: string | null): Promise<string | null | undefined> {
  const picked = await openDialog({ directory: true, multiple: false, title, defaultPath: current ?? undefined });
  if (typeof picked === "string") return picked;
  return undefined;
}

function shorten(path: string | null, fallback: string): string {
  if (!path) return fallback;
  return path.replace(/^\/Users\/[^/]+|^\/home\/[^/]+/, "~");
}

/** Folders are chosen, not typed. Clear returns a folder to its default. */
export function AdvancedFiles({ settings, update }: SettingsPaneProps) {
  const choose = async (key: "workspaceRoot" | "screenshotDir", title: string) => {
    const picked = await pickFolder(title, settings[key]);
    if (picked !== undefined) void update({ [key]: picked } as Partial<typeof settings>);
  };

  return (
    <div className="settings-group">
      <SettingRow label="Default project folder" hint={shorten(settings.workspaceRoot, "New terminals start in your home folder unless a project sets its own.")}>
        {settings.workspaceRoot ? <button className="btn btn--ghost" onClick={() => void update({ workspaceRoot: null })}>Clear</button> : null}
        <button className="btn" onClick={() => void choose("workspaceRoot", "Choose the default project folder")}>Choose…</button>
      </SettingRow>
      <SettingRow
        label="Save screenshots to"
        hint={<>{shorten(settings.screenshotDir, "~/Pictures/Vibyra")} · captured with <kbd className="kbd">{shortcutLabel(settings.screenshotShortcut)}</kbd></>}
      >
        {settings.screenshotDir ? <button className="btn btn--ghost" onClick={() => void update({ screenshotDir: null })}>Clear</button> : null}
        <button className="btn" onClick={() => void choose("screenshotDir", "Choose where screenshots are saved")}>Choose…</button>
      </SettingRow>
      <SettingRow
        label="Include the Vibyra window"
        hint={isMac ? "Off moves Vibyra out of the way before the main display is captured." : "Off moves Vibyra out of the way before the capture."}
      >
        <Switch
          checked={!settings.screenshotHideWindow}
          label="Include the Vibyra window in screenshots"
          onChange={(include) => void update({ screenshotHideWindow: !include })}
        />
      </SettingRow>
    </div>
  );
}
