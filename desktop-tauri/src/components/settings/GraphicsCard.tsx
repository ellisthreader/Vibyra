import { useEffect, useState } from "react";

import { rendererPolicy } from "../../ipc/render";
import { rendererNeedsRestart } from "../../lib/rendererPolicy";
import type { RendererMode, RendererPolicy } from "../../types";
import { SettingRow, SettingsBlock, type SettingsPaneProps } from "./SettingsShared";

const MODES: { id: RendererMode; label: string; hint: string }[] = [
  { id: "auto", label: "Automatic (recommended)", hint: "Starts safely and offers GPU acceleration if CPU rendering stays slow" },
  { id: "accelerated", label: "Allow GPU", hint: "Use GPU acceleration next launch; can freeze on some NVIDIA setups" },
  { id: "compatibility", label: "Compatibility", hint: "Do not use GPU acceleration; uses more CPU while output streams" },
];

function activeLabel(policy: RendererPolicy): string {
  return policy.softwareCompositing ? "CPU compatibility mode" : "GPU acceleration";
}

function autoHint(policy: RendererPolicy): string {
  return policy.nvidiaSession
    ? "This NVIDIA session started safely on the CPU. If rendering stays slow, Vibyra offers GPU acceleration for the next launch."
    : "Automatic is allowing GPU acceleration on this system.";
}

/**
 * Graphics mode for the terminal renderer. WebKit reads the compositing choice
 * when the webview is created, so a change here lands on the next launch; the
 * card shows the path actually running now so a user seeing blank panes or
 * high CPU can tell which one they are on.
 */
export function GraphicsCard({ settings, update }: SettingsPaneProps) {
  const [policy, setPolicy] = useState<RendererPolicy | null>(null);

  useEffect(() => {
    let cancelled = false;
    void rendererPolicy()
      .then((next) => {
        if (!cancelled) setPolicy(next);
      })
      .catch(() => {
        if (!cancelled) setPolicy(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!policy?.configurable) return null;
  const needsRestart = rendererNeedsRestart(settings.rendererMode, policy);

  return (
    <SettingsBlock label="GPU usage">
      <div className="settings-group">
        <SettingRow
          label="Allow GPU usage for Vibyra"
          hint={
            <>
              Running now: <strong>{activeLabel(policy)}</strong>.{" "}
              {settings.rendererMode === "auto"
                ? autoHint(policy)
                : "Overriding automatic detection."}
            </>
          }
          stack
        >
          <div className="graphics-modes" role="radiogroup" aria-label="GPU usage">
            {MODES.map((option) => (
              <button
                key={option.id}
                role="radio"
                aria-checked={settings.rendererMode === option.id}
                className={`graphics-mode ${settings.rendererMode === option.id ? "graphics-mode--active" : ""}`}
                onClick={() => void update({ rendererMode: option.id })}
              >
                <span className="graphics-mode__label">{option.label}</span>
                <span className="graphics-mode__hint">{option.hint}</span>
              </button>
            ))}
          </div>
        </SettingRow>
        {policy.environmentOverride ? (
          <p className="settings-note">
            VIBYRA_WEBKIT_DMABUF is set in your launch environment and takes priority
            over this setting. Unset it for the choice above to apply.
          </p>
        ) : needsRestart ? (
          <p className="settings-note">Restart Vibyra to apply the new graphics mode.</p>
        ) : null}
      </div>
    </SettingsBlock>
  );
}
