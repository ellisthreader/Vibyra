import { useEffect, useMemo, useState } from "react";

import { useModelCatalogStore } from "../../state/modelCatalogStore";
import { RestartIcon } from "../common/Icons";
import { CustomAgentsEditor } from "./CustomAgentsEditor";
import { StatusChip } from "./SettingsControls";
import { SettingRow, type SettingsPaneProps } from "./SettingsShared";
import { TerminalIntegrations } from "./TerminalIntegrations";

/** The OpenRouter public catalog: automatic, so it is a diagnostic row here
 * rather than a card on the accounts page. It is not a billing account. */
function CatalogRow() {
  const groups = useModelCatalogStore((state) => state.groups);
  const loading = useModelCatalogStore((state) => state.loading);
  const source = useModelCatalogStore((state) => state.source);
  const refresh = useModelCatalogStore((state) => state.refresh);
  const count = useMemo(() => groups.reduce((sum, group) => sum + group.models.length, 0), [groups]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const label = loading ? "Refreshing" : source === "live" ? "Live" : source === "cache" ? "Cached" : "Offline list";
  const tone = loading ? "busy" : source === "live" ? "on" : "warn";

  return (
    <SettingRow label="OpenRouter model catalog" hint={`${count} models available in agent launchers. Refreshed automatically; not a connected account.`}>
      <StatusChip tone={tone}>{label}</StatusChip>
      <button type="button" className="btn btn--ghost" disabled={loading} onClick={() => void refresh(true)}>
        <RestartIcon size={13} />Refresh
      </button>
    </SettingRow>
  );
}

/** Extra local CLIs, the model catalog they draw on, and custom agents. */
export function AdvancedRuntimes({ settings, update }: SettingsPaneProps) {
  const [adding, setAdding] = useState(false);
  return (
    <>
      <TerminalIntegrations settings={settings} update={update} />
      <div className="settings-group">
        <CatalogRow />
        <SettingRow label="Custom agents" hint="Point at any AI command-line tool on this machine; it appears in the launcher.">
          {settings.customAgents.length ? <StatusChip tone="accent">{settings.customAgents.length} added</StatusChip> : null}
          <button className="btn" onClick={() => setAdding((open) => !open)}>{adding ? "Close" : "Add custom agent"}</button>
        </SettingRow>
        <CustomAgentsEditor settings={settings} update={update} adding={adding} onAdded={() => setAdding(false)} />
      </div>
    </>
  );
}
