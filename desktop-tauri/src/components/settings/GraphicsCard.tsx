import { useEffect, useState } from "react";

import { rendererPolicy } from "../../ipc/render";
import { rendererNeedsRestart } from "../../lib/rendererPolicy";
import type { RendererMode, RendererPolicy } from "../../types";
import { Disclosure, Segmented, StatusChip } from "./SettingsControls";
import { SettingRow, type SettingsPaneProps } from "./SettingsShared";

const MODES: { id: RendererMode; label: string }[] = [
  { id: "auto", label: "Automatic" },
  { id: "accelerated", label: "Accelerated" },
  { id: "compatibility", label: "Compatibility" },
];

const MODE_HINTS: Record<RendererMode, string> = {
  auto: "Uses compatibility graphics to keep terminal text current.",
  accelerated: "May improve graphics speed, but can delay terminal text on Linux.",
  compatibility: "Uses shared-memory graphics for wider GPU compatibility.",
};

function activeLabel(policy: RendererPolicy): string {
  return policy.softwareCompositing ? "Compatibility" : "Accelerated";
}

/**
 * Graphics mode for the Linux webview, as one Advanced group. WebKit reads
 * the compositing choice when the webview is created, so a change lands on
 * the next launch; the row shows the path actually running now so a user
 * seeing graphics trouble or high CPU can tell which one they are on. Renders
 * nothing where the platform offers no choice (macOS, Windows).
 */
export function GraphicsCard({
  settings,
  update,
  open,
  onToggle,
}: SettingsPaneProps & { open: boolean; onToggle: (open: boolean) => void }) {
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
  const summary = needsRestart ? "Restart required" : `Running ${activeLabel(policy).toLowerCase()}`;

  return (
    <Disclosure title="Graphics" summary={summary} open={open} onToggle={onToggle} panel="graphics">
      <div className="settings-group">
        <SettingRow
          label="Renderer"
          hint={MODE_HINTS[settings.rendererMode]}
        >
          <StatusChip tone={needsRestart ? "warn" : "on"}>{needsRestart ? "Restart required" : activeLabel(policy)}</StatusChip>
          <Segmented label="Graphics mode" value={settings.rendererMode} options={MODES} onChange={(rendererMode) => void update({ rendererMode })} />
        </SettingRow>
        {policy.environmentOverride ? (
          <p className="settings-note">
            WEBKIT_DISABLE_DMABUF_RENDERER or VIBYRA_WEBKIT_DMABUF is set in your environment and
            takes priority over this setting. Unset it for the choice above to apply.
          </p>
        ) : needsRestart ? (
          <p className="settings-note">Restart Vibyra to apply the new graphics mode.</p>
        ) : null}
      </div>
    </Disclosure>
  );
}
