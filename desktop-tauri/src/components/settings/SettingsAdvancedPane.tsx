import { useEffect, useState } from "react";

import { useWorkspaceStore, type SettingsPanelId } from "../../state/workspaceStore";
import { AdvancedFiles } from "./AdvancedFiles";
import { AdvancedRuntimes } from "./AdvancedRuntimes";
import { AdvancedTerminal } from "./AdvancedTerminal";
import { GraphicsCard } from "./GraphicsCard";
import { Disclosure } from "./SettingsControls";
import type { SettingsPaneProps } from "./SettingsShared";

type Group = Extract<SettingsPanelId, "terminal" | "files" | "graphics" | "runtimes">;

/**
 * Expert controls, each group collapsed. A deep link (a performance warning
 * pointing at Graphics, a launcher pointing at Runtimes) opens its group on
 * arrival; nothing here is needed to use Vibyra day to day.
 */
export function SettingsAdvancedPane({ settings, update }: SettingsPaneProps) {
  const panel = useWorkspaceStore((state) => state.settingsPanel);
  const [open, setOpen] = useState<Record<Group, boolean>>({ terminal: false, files: false, graphics: false, runtimes: false });

  useEffect(() => {
    if (panel && panel in open) setOpen((prev) => ({ ...prev, [panel]: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel]);

  const toggle = (group: Group) => (next: boolean) => setOpen((prev) => ({ ...prev, [group]: next }));
  const font = settings.fontFamily.split(",")[0].replace(/["']/g, "").trim();

  return (
    <>
      <p className="settings-block__note">Rarely changed. Everything here keeps working on its defaults.</p>
      <Disclosure title="Terminal" summary={`${font} · ${settings.scrollbackLines.toLocaleString()} lines`} open={open.terminal} onToggle={toggle("terminal")} panel="terminal">
        <AdvancedTerminal settings={settings} update={update} />
      </Disclosure>
      <Disclosure title="Files and screenshots" summary={settings.workspaceRoot ? settings.workspaceRoot.replace(/^\/Users\/[^/]+|^\/home\/[^/]+/, "~") : "Default folders"} open={open.files} onToggle={toggle("files")} panel="files">
        <AdvancedFiles settings={settings} update={update} />
      </Disclosure>
      <GraphicsCard settings={settings} update={update} open={open.graphics} onToggle={toggle("graphics")} />
      <Disclosure title="Runtimes" summary="Extra CLIs, custom agents, model catalog" open={open.runtimes} onToggle={toggle("runtimes")} panel="runtimes">
        <AdvancedRuntimes settings={settings} update={update} />
      </Disclosure>
    </>
  );
}
