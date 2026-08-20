import { useEffect, useState } from "react";

import { rendererPolicy } from "../../ipc/render";
import { rendererNeedsRestart } from "../../lib/rendererPolicy";
import type { RendererMode, RendererPolicy } from "../../types";
import { SettingRow, SettingsBlock, type SettingsPaneProps } from "./SettingsShared";

const MODES: { id: RendererMode; label: string; hint: string }[] = [
  { id: "auto", label: "Auto", hint: "Picks the safe path for your GPU" },
  { id: "accelerated", label: "Accelerated", hint: "Best performance; can freeze on some NVIDIA setups" },
  { id: "compatibility", label: "Compatibility", hint: "Always correct; uses more CPU while output streams" },
];

function activeLabel(policy: RendererPolicy): string {
  return policy.softwareCompositing ? "Compatibility (shared memory)" : "Accelerated (DMA-BUF)";
}

function autoHint(policy: RendererPolicy): string {
  return policy.nvidiaSession
    ? "This session renders through NVIDIA, where WebKit's accelerated renderer can freeze windows."
    : "No NVIDIA rendering detected, so the accelerated path is in use.";
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
    <SettingsBlock label="Graphics">
      <div className="settings-group">
        <SettingRow
          label="Graphics mode"
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
          <div className="graphics-modes" role="radiogroup" aria-label="Graphics mode">
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
            WEBKIT_DISABLE_DMABUF_RENDERER or VIBYRA_WEBKIT_DMABUF is set in your
            environment and takes priority over this setting. Unset it for the choice
            above to apply.
          </p>
        ) : needsRestart ? (
          <p className="settings-note">Restart Vibyra to apply the new graphics mode.</p>
        ) : null}
      </div>
    </SettingsBlock>
  );
}
