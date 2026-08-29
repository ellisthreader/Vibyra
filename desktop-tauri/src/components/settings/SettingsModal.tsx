import { useRef } from "react";
import type { ComponentType } from "react";

import { useModalFocus } from "../../lib/useModalFocus";
import { useSettingsStore } from "../../state/settingsStore";
import { type SettingsSectionId, useWorkspaceStore } from "../../state/workspaceStore";
import { BellIcon } from "../common/StatusIcons";
import { BotIcon, CloseIcon, CommandIcon, GaugeIcon, GearIcon, GitBranchIcon, LinkIcon, RestartIcon, SparklesIcon, UserIcon } from "../common/Icons";
import { SettingsAgentsPane } from "./SettingsAgentsPane";
import { SettingsAiPane } from "./SettingsAiPane";
import { SettingsGeneralPane } from "./SettingsGeneralPane";
import { SettingsNotificationsPane } from "./SettingsNotificationsPane";
import { SettingsIntegrationsPane } from "./SettingsIntegrationsPane";
import { SettingsPerformancePane } from "./SettingsPerformancePane";
import { SettingsProfilePane } from "./SettingsProfilePane";
import { SettingsShortcutsPane } from "./SettingsShortcutsPane";
import { SettingsUpdatesPane } from "./SettingsUpdatesPane";
import { SettingsWorkspacesPane } from "./SettingsWorkspacesPane";

interface Section {
  id: SettingsSectionId;
  label: string;
  blurb: string;
  icon: ComponentType<{ size?: number }>;
}

/** Grouped rather than one flat list of nine. The three AI sections used to sit
 * wedged between Notifications and Shortcuts, so "where do I switch account"
 * had nothing to scan for. */
const GROUPS: { label: string; items: Section[] }[] = [
  {
    label: "Account",
    items: [
      { id: "profile", label: "Profile", blurb: "Your Vibyra account and session", icon: UserIcon },
    ],
  },
  {
    label: "AI",
    items: [
      { id: "integrations", label: "Integrations", blurb: "Connected AI accounts and model services", icon: LinkIcon },
      { id: "ai", label: "Vibyra AI", blurb: "Your OpenAI key, usage and spend limits", icon: SparklesIcon },
      { id: "agents", label: "Custom agents", blurb: "Bring any AI CLI into the rail", icon: BotIcon },
      { id: "workspaces", label: "Safe workspaces", blurb: "The isolated worktrees agents run in, and the disk they hold", icon: GitBranchIcon },
    ],
  },
  {
    label: "Application",
    items: [
      { id: "general", label: "General", blurb: "Theme, terminal and folder defaults", icon: GearIcon },
      { id: "performance", label: "Performance", blurb: "What Vibyra is using right now, and the levers that change it", icon: GaugeIcon },
      { id: "notifications", label: "Notifications", blurb: "Alerts, sounds and desktop notices", icon: BellIcon },
      { id: "shortcuts", label: "Shortcuts", blurb: "Set global tools and review app controls", icon: CommandIcon },
      { id: "updates", label: "Updates", blurb: "Your version, and any release waiting to install", icon: RestartIcon },
    ],
  },
];

const SECTIONS: Section[] = GROUPS.flatMap((group) => group.items);

export function SettingsModal() {
  const open = useWorkspaceStore((state) => state.settingsOpen);
  const close = useWorkspaceStore((state) => state.closeSettings);
  const active = useWorkspaceStore((state) => state.settingsSection);
  const setActive = useWorkspaceStore((state) => state.setSettingsSection);
  const settings = useSettingsStore((state) => state.settings);
  const update = useSettingsStore((state) => state.update);
  const modalRef = useRef<HTMLDivElement>(null);
  useModalFocus(modalRef, open, close);

  if (!open || !settings) return null;
  const section = SECTIONS.find((item) => item.id === active) ?? SECTIONS[0];
  const pane = {
    profile: <SettingsProfilePane />,
    general: <SettingsGeneralPane settings={settings} update={update} />,
    performance: <SettingsPerformancePane settings={settings} update={update} />,
    notifications: <SettingsNotificationsPane settings={settings} update={update} />,
    ai: <SettingsAiPane settings={settings} update={update} />,
    integrations: <SettingsIntegrationsPane settings={settings} update={update} />,
    agents: <SettingsAgentsPane settings={settings} update={update} />,
    workspaces: <SettingsWorkspacesPane />,
    shortcuts: <SettingsShortcutsPane settings={settings} update={update} />,
    updates: <SettingsUpdatesPane />,
  }[section.id];

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal settings-modal" role="dialog" aria-modal="true" aria-label="Settings" ref={modalRef} onClick={(event) => event.stopPropagation()}>
        <aside className="settings-nav">
          <div className="settings-nav__title">Settings</div>
          <nav className="settings-nav__list" aria-label="Settings sections">
            {GROUPS.map((group) => (
              <div key={group.label} className="settings-nav__group" role="group" aria-label={group.label}>
                <span className="settings-nav__group-label">{group.label}</span>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button key={item.id} className={`settings-nav__item ${item.id === active ? "settings-nav__item--active" : ""}`} aria-current={item.id === active} onClick={() => setActive(item.id)}>
                      <Icon size={15} />{item.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="settings-nav__foot">Changes apply live and persist on disk.</div>
        </aside>
        <div className="settings-pane">
          <header className="settings-pane__header">
            <div className="settings-pane__heading">
              <h2 className="settings-pane__title">{section.label}</h2>
              <p className="settings-pane__blurb">{section.blurb}</p>
            </div>
            <button className="icon-btn" onClick={close} title="Close"><CloseIcon size={15} /></button>
          </header>
          <div className="settings-pane__body">{pane}</div>
        </div>
      </div>
    </div>
  );
}
