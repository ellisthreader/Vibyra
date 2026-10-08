import { useT } from "../../i18n";
import { ClearWorkspaceRow } from "./ClearWorkspaceRow";
import { ProjectContextRow } from "./ProjectContextRow";
import { SettingRow, SettingsBlock, Switch, type SettingsPaneProps } from "./SettingsShared";
import { computerName } from "../../lib/platform";
import { useAccountStore } from "../../state/accountStore";
import { AccountDataBlock } from "./AccountDataBlock";

export function SettingsPrivacyPane({ settings, update }: SettingsPaneProps) {
  const t = useT();
  const owner = useAccountStore(s => s.snapshot.profile?.welcomeKey);
  return <>
    <SettingsBlock label={t("settings.privacy")} panel="privacy">
      <div className="settings-group">
        <ProjectContextRow settings={settings} update={update} />
        <SettingRow label={t("settings.restoreOutput")} hint={t("settings.restoreOutputHint", { computer: computerName })}>
          <Switch checked={settings.persistTerminalScrollback} label={t("settings.restoreOutput")}
            onChange={persistTerminalScrollback => void update({ persistTerminalScrollback })} />
        </SettingRow>
        <ClearWorkspaceRow />
      </div>
    </SettingsBlock>
    <AccountDataBlock key={owner} />
  </>;
}
