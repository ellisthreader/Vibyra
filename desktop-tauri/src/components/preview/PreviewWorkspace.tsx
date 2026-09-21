import { useCallback, useEffect, useState } from "react";

import { deviceByKey } from "../../lib/previewDevices";
import {
  loadViewport,
  saveViewport,
} from "../../lib/previewPersistence";
import type {
  PreviewTarget,
  PreviewViewportState,
} from "../../previewTypes";
import { PreviewDeviceFrame } from "./PreviewDeviceFrame";
import { PreviewAddress } from "./PreviewAddress";
import { PreviewToolbar } from "./PreviewToolbar";
import { useProjectPreview } from "./useProjectPreview";

interface Props {
  projectId: string;
  root: string;
  projectRoot?: string;
  onResetScope?: () => void;
}

export function PreviewWorkspace({ projectId, root, projectRoot = root, onResetScope }: Props) {
  const controller = useProjectPreview(projectId, root, projectRoot);
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const surfaceKey = manualUrl ? "manual-url" : controller.target?.id ?? "inspection";
  const active = manualUrl ? {
    ...controller, inspecting: false, inspection: null, targetId: "manual-url",
    target: { id: "manual-url", name: "Your website", framework: "URL", relativeRoot: ".", command: null,
      runnable: true, reason: null, deviceHint: "desktop" as const, landscape: false },
    status: { phase: "running" as const, targetId: "manual-url", url: manualUrl, command: null, logs: [], error: null },
    stop: async () => setManualUrl(null),
  } : controller;

  return (
    <div className="preview-workspace">
      <PreviewAddress url={active.status.url} onOpen={setManualUrl} />
      <PreviewSurface
        key={surfaceKey}
        projectId={projectId}
        target={active.target}
        controller={active}
        onAutomatic={manualUrl ? () => { setManualUrl(null); void controller.inspect(); } : undefined}
        onResetScope={onResetScope}
      />
    </div>
  );
}

interface SurfaceProps {
  projectId: string;
  target: PreviewTarget | null;
  controller: ReturnType<typeof useProjectPreview>;
  onAutomatic?: () => void;
  onResetScope?: () => void;
}

function PreviewSurface({ projectId, target, controller, onResetScope, onAutomatic }: SurfaceProps) {
  const [viewport, setViewport] = useState<PreviewViewportState>(() =>
    target
      ? loadViewport(projectId, target.id, target.deviceHint, target.landscape)
      : {
          deviceKey: "macbook-pro-14",
          landscape: false,
          zoom: 1,
          customWidth: 1280,
          customHeight: 800,
        },
  );
  const [revision, setRevision] = useState(0);
  const [scale, setScale] = useState(0.5);
  const device = deviceByKey(viewport.deviceKey);

  useEffect(() => {
    if (target) saveViewport(projectId, target.id, viewport);
  }, [projectId, target, viewport]);

  const updateViewport = useCallback((patch: Partial<PreviewViewportState>) => {
    setViewport((current) => ({
      ...current,
      ...patch,
      customWidth:
        patch.customWidth === undefined
          ? current.customWidth
          : Math.min(7680, Math.max(240, patch.customWidth || 240)),
      customHeight:
        patch.customHeight === undefined
          ? current.customHeight
          : Math.min(4320, Math.max(240, patch.customHeight || 240)),
    }));
  }, []);

  return (
    <>
      <PreviewToolbar
        inspection={controller.inspection}
        target={target}
        targetId={controller.targetId}
        status={controller.status}
        statuses={controller.statuses}
        device={device}
        viewport={viewport}
        scale={scale}
        onResetScope={onResetScope}
        onAutomatic={onAutomatic}
        onTarget={(id) => void controller.selectTarget(id)}
        onViewport={updateViewport}
        onRefresh={() => setRevision((current) => current + 1)}
        onRun={() => void controller.start()}
        onStop={() => void controller.stop()}
      />
      <PreviewDeviceFrame
        device={device}
        viewport={viewport}
        status={controller.status}
        target={target}
        inspecting={controller.inspecting}
        revision={revision}
        onScaleChange={setScale}
        onRun={() => void controller.start()}
        onRetryInspect={() => void controller.inspect()}
      />
    </>
  );
}
