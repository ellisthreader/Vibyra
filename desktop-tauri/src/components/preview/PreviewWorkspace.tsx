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
import { PreviewToolbar } from "./PreviewToolbar";
import { useProjectPreview } from "./useProjectPreview";

interface Props {
  projectId: string;
  root: string;
}

export function PreviewWorkspace({ projectId, root }: Props) {
  const controller = useProjectPreview(projectId, root);
  const surfaceKey = controller.target?.id ?? "inspection";

  return (
    <div className="preview-workspace">
      <PreviewSurface
        key={surfaceKey}
        projectId={projectId}
        target={controller.target}
        controller={controller}
      />
    </div>
  );
}

interface SurfaceProps {
  projectId: string;
  target: PreviewTarget | null;
  controller: ReturnType<typeof useProjectPreview>;
}

function PreviewSurface({ projectId, target, controller }: SurfaceProps) {
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
