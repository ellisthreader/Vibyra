import { useEffect, useRef } from "react";

import { useModalFocus } from "../../lib/useModalFocus";
import { useSettingsStore } from "../../state/settingsStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { CloseIcon } from "../common/Icons";
import { SettingsAccountPane } from "./SettingsAccountPane";
import { SettingsAdvancedPane } from "./SettingsAdvancedPane";
import { SettingsGeneralPane } from "./SettingsGeneralPane";
import { SettingsIntegrationsPane } from "./SettingsIntegrationsPane";
import { SettingsNav } from "./SettingsNav";
import { SettingsNotificationsPane } from "./SettingsNotificationsPane";
import { SettingsPhonePane } from "./SettingsPhonePane";
import { SettingsSaveState } from "./SettingsSaveState";
import { SettingsShortcutsPane } from "./SettingsShortcutsPane";
import { SETTINGS_SECTIONS } from "./settingsSections";

/** Scrolls a deep-linked group into view and outlines it for a moment, then
 * hands the target back so the next open starts clean. Panes that own a
 * Disclosure open it themselves from the same store value before this runs. */
function usePanelReveal(body: React.RefObject<HTMLDivElement | null>) {
  const panel = useWorkspaceStore((state) => state.settingsPanel);
  const clear = useWorkspaceStore((state) => state.clearSettingsPanel);
  useEffect(() => {
    if (!panel || !body.current) return;
    const target = body.current.querySelector<HTMLElement>(`[data-panel="${panel}"]`);
    if (!target) return;
    target.scrollIntoView({ block: "start" });
    target.classList.add("settings-reveal");
    const timer = window.setTimeout(() => {
      target.classList.remove("settings-reveal");
      clear();
    }, 1_600);
    return () => window.clearTimeout(timer);
  }, [panel, body, clear]);
}

export function SettingsModal() {
  const open = useWorkspaceStore((state) => state.settingsOpen);
  const close = useWorkspaceStore((state) => state.closeSettings);
  const active = useWorkspaceStore((state) => state.settingsSection);
  const settings = useSettingsStore((state) => state.settings);
  const update = useSettingsStore((state) => state.update);
  const modalRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useModalFocus(modalRef, open, close);
  usePanelReveal(bodyRef);

  // Every section starts at the top: the scroll position of the last page
  // must not carry over to a shorter one.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [active]);

  if (!open || !settings) return null;
  const section = SETTINGS_SECTIONS.find((item) => item.id === active) ?? SETTINGS_SECTIONS[0];
  const pane = {
    general: <SettingsGeneralPane settings={settings} update={update} />,
    ai: <SettingsIntegrationsPane settings={settings} update={update} />,
    notifications: <SettingsNotificationsPane settings={settings} update={update} />,
    iphone: <SettingsPhonePane />,
    shortcuts: <SettingsShortcutsPane settings={settings} update={update} />,
    account: <SettingsAccountPane />,
    advanced: <SettingsAdvancedPane settings={settings} update={update} />,
  }[section.id];

  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className="modal settings-modal settings-modal--tiles"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        ref={modalRef}
        onClick={(event) => event.stopPropagation()}
      >
        <SettingsNav />
        <div className="settings-pane">
          <header className="settings-pane__header">
            <h2 className="settings-pane__title">{section.label}</h2>
            <div className="settings-pane__tools">
              <SettingsSaveState />
              <button className="icon-btn" onClick={close} title="Close" aria-label="Close settings">
                <CloseIcon size={15} />
              </button>
            </div>
          </header>
          <div className="settings-pane__body" ref={bodyRef}>{pane}</div>
        </div>
      </div>
    </div>
  );
}
