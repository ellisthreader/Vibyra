import { useEffect } from "react";

import { useAiServiceStore } from "../../state/aiServiceStore";
import { shortcutLabel } from "../../lib/hotkeys";
import { AiLimitsCard } from "./AiLimitsCard";
import { AiUsageCard } from "./AiUsageCard";
import { OpenAiKeyCard } from "./OpenAiKeyCard";
import { SettingsBlock, type SettingsPaneProps } from "./SettingsShared";

export function SettingsAiPane({ settings, update }: SettingsPaneProps) {
  const status = useAiServiceStore((state) => state.status);
  const refresh = useAiServiceStore((state) => state.refresh);

  // Usage moves while the pane is open — a chat reply or a dictation lands and
  // the meters should follow it.
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  if (!status) return <p className="integration-loading">Checking your OpenAI key…</p>;

  const voiceKey = shortcutLabel(settings.voiceShortcut);

  return (
    <section className="settings-ai">
      <p className="settings-ai__intro">
        Vibyra AI chat and <kbd className="kbd">{voiceKey}</kbd> dictation run on
        OpenAI. Both use a key you supply, so the account and the bill stay
        yours. Nothing else in Vibyra needs this key — terminals and connected AI
        accounts are unaffected.
      </p>

      <SettingsBlock label="Your OpenAI key">
        <OpenAiKeyCard status={status} />
      </SettingsBlock>

      <SettingsBlock label="What it powers">
        <div className="ai-uses">
          <div className="ai-use">
            <strong>Vibyra AI chat</strong>
            <span>The project companion panel, answering with {status.pricing.chatModel}.</span>
          </div>
          <div className="ai-use">
            <strong>{voiceKey} dictation</strong>
            <span>
              Speech into the focused terminal, transcribed by {status.pricing.voiceModel}.
              {status.recorderAvailable ? "" : " Needs the arecord command, which is missing on this machine."}
            </span>
          </div>
        </div>
      </SettingsBlock>

      <SettingsBlock label="Usage">
        <AiUsageCard status={status} />
      </SettingsBlock>

      <SettingsBlock label="Spend limits">
        <AiLimitsCard settings={settings} update={update} />
      </SettingsBlock>
    </section>
  );
}
