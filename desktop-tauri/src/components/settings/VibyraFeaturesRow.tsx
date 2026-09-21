import { useEffect, useState } from "react";

import { shortcutLabel } from "../../lib/hotkeys";
import { useAiServiceStore } from "../../state/aiServiceStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { AiLimitsCard } from "./AiLimitsCard";
import { AiUsageCard } from "./AiUsageCard";
import { OpenAiKeyCard } from "./OpenAiKeyCard";
import { Disclosure, StatusChip } from "./SettingsControls";
import { SettingRow, SettingsBlock, type SettingsPaneProps } from "./SettingsShared";

function usd(value: number): string {
  return `$${value.toFixed(2)}`;
}

/**
 * Chat and voice typing run on an OpenAI API key you supply. One row says
 * whether that is ready; Set up / Manage opens the key card, and the usage
 * meters and spend caps sit behind their own disclosure because they protect
 * money and deserve room, but not on first sight.
 */
export function VibyraFeaturesRow({ settings, update }: SettingsPaneProps) {
  const status = useAiServiceStore((state) => state.status);
  const refresh = useAiServiceStore((state) => state.refresh);
  const panel = useWorkspaceStore((state) => state.settingsPanel);
  const [keyOpen, setKeyOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);

  // Usage moves while the page is open — a chat reply or a dictation lands and
  // the meters should follow it.
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (panel === "vibyraFeatures") setKeyOpen(true);
    if (panel === "usage") setUsageOpen(true);
  }, [panel]);

  const ready = Boolean(status?.keyConfigured);
  const voiceKey = shortcutLabel(settings.voiceShortcut);

  return (
    <SettingsBlock label="Vibyra features" panel="vibyraFeatures">
      <div className="settings-group">
        <SettingRow
          label="Chat and voice typing"
          hint={
            ready
              ? <>Vibyra AI chat and <kbd className="kbd">{voiceKey}</kbd> dictation, on your own OpenAI API key{status?.keyHint ? <> · <code className="ai-key__hint">{status.keyHint}</code></> : null}.</>
              : "Needs an OpenAI API key. The terminal accounts above are separate and are not used for this."
          }
        >
          {status ? <StatusChip tone={ready ? "on" : "off"}>{ready ? "Ready" : "Not set up"}</StatusChip> : null}
          <button className={`btn ${ready ? "" : "btn--primary"}`} disabled={!status} onClick={() => setKeyOpen((open) => !open)}>
            {ready ? (keyOpen ? "Done" : "Manage") : "Set up"}
          </button>
        </SettingRow>
        {keyOpen && status ? <OpenAiKeyCard status={status} /> : null}
      </div>

      {status ? (
        <Disclosure
          title="Usage and limits"
          summary={`${usd(status.usage.spendTodayUsd)} today · ${usd(status.usage.spendMonthUsd)} this month`}
          open={usageOpen}
          onToggle={setUsageOpen}
          panel="usage"
        >
          <div className="ai-usage-wrap">
            <AiUsageCard status={status} />
          </div>
          <AiLimitsCard settings={settings} update={update} />
        </Disclosure>
      ) : null}
    </SettingsBlock>
  );
}
