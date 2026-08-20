import { useRef } from "react";
import type { ComponentType } from "react";

import { useModalFocus } from "../../lib/useModalFocus";
import { useSettingsStore } from "../../state/settingsStore";
import { type SettingsSectionId, useWorkspaceStore } from "../../state/workspaceStore";
import { BotIcon, CloseIcon, CommandIcon, GearIcon, LinkIcon, SparklesIcon, UserIcon } from "../common/Icons";
import { SettingsAgentsPane } from "./SettingsAgentsPane";
import { SettingsAiPane } from "./SettingsAiPane";
import { SettingsGeneralPane } from "./SettingsGeneralPane";
import { SettingsIntegrationsPane } from "./SettingsIntegrationsPane";
import { SettingsProfilePane } from "./SettingsProfilePane";
import { SettingsShortcutsPane } from "./SettingsShortcutsPane";

interface Section {
  id: SettingsSectionId;
  label: string;
  blurb: string;
  icon: ComponentType<{ size?: number }>;
  /** Renders a divider above this row — separates account from app groups. */
  groupStart?: boolean;
}

const SECTIONS: Section[] = [
  { id: "profile", label: "Profile", blurb: "Your Vibyra account and session", icon: UserIcon },
  { id: "general", label: "General", blurb: "Theme, terminal and folder defaults", icon: GearIcon, groupStart: true },
  { id: "ai", label: "Vibyra AI", blurb: "Your OpenAI key, usage and spend limits", icon: SparklesIcon },
  { id: "integrations", label: "Integrations", blurb: "Connected AI accounts and model services", icon: LinkIcon },
  { id: "agents", label: "Custom agents", blurb: "Bring any AI CLI into the rail", icon: BotIcon },
  { id: "shortcuts", label: "Shortcuts", blurb: "Set global tools and review app controls", icon: CommandIcon },
];

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
    ai: <SettingsAiPane settings={settings} update={update} />,
    integrations: <SettingsIntegrationsPane settings={settings} update={update} />,
    agents: <SettingsAgentsPane settings={settings} update={update} />,
    shortcuts: <SettingsShortcutsPane settings={settings} update={update} />,
  }[section.id];

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal settings-modal" role="dialog" aria-modal="true" aria-label="Settings" ref={modalRef} onClick={(event) => event.stopPropagation()}>
        <aside className="settings-nav">
          <div className="settings-nav__title">Settings</div>
          <nav className="settings-nav__list" aria-label="Settings sections">
            {SECTIONS.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.id} className="settings-nav__slot">
                  {item.groupStart && <div className="settings-nav__sep" role="separator" />}
                  <button className={`settings-nav__item ${item.id === active ? "settings-nav__item--active" : ""}`} aria-current={item.id === active} onClick={() => setActive(item.id)}>
                    <Icon size={15} />{item.label}
                  </button>
                </div>
              );
            })}
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
