import { useEffect, useState } from "react";

import { rendererPolicy } from "../../ipc/render";
import { restartAppNow } from "../../lib/appRestart";
import { rendererNeedsRestart } from "../../lib/rendererPolicy";
import type { RendererMode, RendererPolicy } from "../../types";
import { SettingsBlock, type SettingsPaneProps } from "./SettingsShared";

const MODES: { id: RendererMode; label: string; hint: string }[] = [
  { id: "auto", label: "Automatic (recommended)", hint: "Picks the fastest path this machine can actually deliver" },
  { id: "accelerated", label: "Allow GPU", hint: "Use GPU acceleration next launch; can freeze on some NVIDIA setups" },
  { id: "compatibility", label: "Compatibility", hint: "Do not use GPU acceleration; uses more CPU while output streams" },
];

/** The measured truth on NVIDIA replaces the generic trade-off text: the GPU
 * path is the slow one there, and terminals refuse WebGL on it either way. */
function modeHint(option: (typeof MODES)[number], policy: RendererPolicy): string {
  if (option.id === "accelerated" && policy.nvidiaSession) {
    return "Measured slower on this NVIDIA system and not recommended; terminals stay on safe drawing";
  }
  return option.hint;
}

function activeLabel(policy: RendererPolicy): string {
  return policy.softwareCompositing ? "CPU compatibility mode" : "GPU acceleration";
}

function autoHint(policy: RendererPolicy): string {
  return policy.nvidiaSession
    ? "Automatic keeps this NVIDIA session on CPU compositing — the measured-faster path here."
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
      <p className="settings-lead settings-lead--foot">
        Running now: <strong>{activeLabel(policy)}</strong>.{" "}
        {settings.rendererMode === "auto" ? autoHint(policy) : "Overriding automatic detection."}
      </p>
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
            <span className="graphics-mode__hint">{modeHint(option, policy)}</span>
          </button>
        ))}
      </div>
      {policy.environmentOverride ? (
        <div className="settings-group">
          <p className="settings-note">
            VIBYRA_WEBKIT_DMABUF is set in your launch environment and takes priority
            over this setting. Unset it for the choice above to apply.
          </p>
        </div>
      ) : needsRestart ? (
        <div className="settings-group">
          <p className="settings-note settings-note--action">
            Restart Vibyra to apply the new graphics mode.{" "}
            <button className="btn" onClick={() => void restartAppNow()}>
              Restart now
            </button>
          </p>
        </div>
      ) : null}
    </SettingsBlock>
  );
}
