import { useEffect, useState } from "react";

import { useWorkspaceStore, type SettingsPanelId } from "../../state/workspaceStore";
import { AdvancedFiles } from "./AdvancedFiles";
import { AdvancedRuntimes } from "./AdvancedRuntimes";
import { AdvancedTerminal } from "./AdvancedTerminal";
import { GraphicsCard } from "./GraphicsCard";
import { SettingsAdvancedVoice } from "./SettingsAdvancedVoice";
import { Disclosure } from "./SettingsControls";
import type { SettingsPaneProps } from "./SettingsShared";

type Group = Extract<SettingsPanelId, "terminal" | "files" | "graphics" | "runtimes" | "voice">;

const RATE_LABEL: Record<string, string> = { "0.75": "0.75×", "0.9": "0.9×", "1": "1×", "1.25": "1.25×", "1.5": "1.5×" };

/**
 * Expert controls, each group collapsed. A deep link (a launcher pointing at
 * Runtimes) opens its group on arrival; nothing here is needed to use Vibyra
 * day to day.
 *
 * Order is how likely you are to want the group: voice first, then the
 * workspace, then the machine. Graphics is last because it renders nothing
 * except on Linux. The OpenAI key and its spend caps are deliberately absent —
 * the service credential is the deployment's, not the user's, so there is
 * nothing here to change and no page to send a spend warning to.
 */
export function SettingsAdvancedPane({ settings, update }: SettingsPaneProps) {
  const panel = useWorkspaceStore((state) => state.settingsPanel);
  const [open, setOpen] = useState<Record<Group, boolean>>({ voice: false, terminal: false, files: false, runtimes: false, graphics: false });

  useEffect(() => {
    if (panel && panel in open) setOpen((prev) => ({ ...prev, [panel]: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel]);

  const toggle = (group: Group) => (next: boolean) => setOpen((prev) => ({ ...prev, [group]: next }));
  const font = settings.fontFamily.split(",")[0].replace(/["']/g, "").trim();
  const voice = settings.speechVoice ? settings.speechVoice.charAt(0).toUpperCase() + settings.speechVoice.slice(1) : "Default voice";
  const rate = RATE_LABEL[String(settings.speechRate ?? 1)] ?? `${settings.speechRate}×`;

  return (
    <>
      <p className="settings-block__note">Rarely changed. Everything here keeps working on its defaults.</p>
      <Disclosure title="Voice and speech" summary={`${voice} · ${rate}`} open={open.voice} onToggle={toggle("voice")} panel="voice">
        <SettingsAdvancedVoice settings={settings} update={update} />
      </Disclosure>
      <Disclosure title="Terminal" summary={`${font} · ${settings.scrollbackLines.toLocaleString()} lines`} open={open.terminal} onToggle={toggle("terminal")} panel="terminal">
        <AdvancedTerminal settings={settings} update={update} />
      </Disclosure>
      <Disclosure title="Files and screenshots" summary={settings.workspaceRoot ? settings.workspaceRoot.replace(/^\/Users\/[^/]+|^\/home\/[^/]+/, "~") : "Default folders"} open={open.files} onToggle={toggle("files")} panel="files">
        <AdvancedFiles settings={settings} update={update} />
      </Disclosure>
      <Disclosure title="Runtimes" summary="Extra CLIs, custom agents, model catalog" open={open.runtimes} onToggle={toggle("runtimes")} panel="runtimes">
        <AdvancedRuntimes settings={settings} update={update} />
      </Disclosure>
      <GraphicsCard settings={settings} update={update} open={open.graphics} onToggle={toggle("graphics")} />
    </>
  );
}
