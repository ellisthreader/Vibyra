import { useEffect, useMemo, useRef, useState } from "react";

import type {
  PreviewDevice,
  PreviewStatus,
  PreviewTarget,
  PreviewViewportState,
} from "../../previewTypes";
import { previewFrameMetrics } from "../../lib/previewFrameMetrics";
import "./previewFrames.css";
import { PreviewOverlay } from "./PreviewOverlay";

interface Props {
  device: PreviewDevice;
  viewport: PreviewViewportState;
  status: PreviewStatus;
  target: PreviewTarget | null;
  inspecting: boolean;
  revision: number;
  onScaleChange: (scale: number) => void;
  onRun: () => void;
  onRetryInspect: () => void;
}

export function PreviewDeviceFrame({
  device,
  viewport,
  status,
  target,
  inspecting,
  revision,
  onScaleChange,
  onRun,
  onRetryInspect,
}: Props) {
  const stage = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0.5);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const sourceWidth = device.key === "custom" ? viewport.customWidth : device.width;
  const sourceHeight = device.key === "custom" ? viewport.customHeight : device.height;
  const width = viewport.landscape ? sourceHeight : sourceWidth;
  const height = viewport.landscape ? sourceWidth : sourceHeight;
  const metrics = useMemo(() => previewFrameMetrics(device, width, height, viewport.landscape), [device, height, width, viewport.landscape]);
  const scale = Math.max(0.02, Math.min(1.25, fit * viewport.zoom));

  useEffect(() => {
    const host = stage.current;
    if (!host) return;
    const measure = () => {
      const rect = host.getBoundingClientRect();
      const next = Math.min(
        1,
        Math.max(0.02, (rect.width - 64) / metrics.outerWidth),
        Math.max(0.02, (rect.height - 64) / metrics.outerHeight),
      );
      setFit(next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    measure();
    return () => observer.disconnect();
  }, [metrics.outerHeight, metrics.outerWidth]);

  useEffect(() => onScaleChange(scale), [onScaleChange, scale]);
  useEffect(() => {
    setLoaded(false); setLoadFailed(false);
    if (!status.url) return;
    const timer = window.setTimeout(() => setLoadFailed(true), 15000);
    return () => window.clearTimeout(timer);
  }, [revision, status.url]);

  const running = status.phase === "running" && status.url;
  const style = {
    "--device-w": width + "px",
    "--device-h": height + "px",
    "--device-bezel": metrics.bezel + "px",
    "--device-bezel-x": metrics.bezelX + "px",
    "--device-bezel-y": metrics.bezelY + "px",
    "--device-radius": device.radius + "px",
    "--screen-radius": device.screenRadius + "px",
    width: metrics.shellWidth,
    height: metrics.shellHeight,
    left: metrics.offsetX * scale,
    transform: "scale(" + scale + ")",
  } as React.CSSProperties;

  return (
    <div ref={stage} className="preview-stage">
      {running && !loaded && loadFailed && <div className="preview-frame-help" role="status">
        The page hasn’t loaded. Check the URL and that your server is running, or choose Open in browser from Preview options.
      </div>}
      {!running && <PreviewOverlay inspecting={inspecting} status={status} target={target} onRun={onRun} onRetryInspect={onRetryInspect} />}
      <div hidden={!running}
        className="preview-stage__sizer"
        style={{ width: metrics.outerWidth * scale, height: metrics.outerHeight * scale }}
      >
        <div className={"preview-device preview-device--" + device.kind} data-landscape={viewport.landscape} data-legacy={metrics.legacy} data-model={device.key} style={style}>
          <div className="preview-device__screen">
            {running && (
              <iframe
                key={String(status.url) + "-" + revision}
                title={(target?.name ?? "Project") + " preview"}
                src={status.url ?? undefined}
                sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin allow-downloads"
                referrerPolicy="no-referrer"
                onLoad={() => { setLoaded(true); setLoadFailed(false); }}
                onError={() => { setLoaded(false); setLoadFailed(true); }}
              />
            )}
            {running && !loaded && (
              <div className="preview-device__loading">
                <span className="preview-spinner" />
                <strong>Loading…</strong>
              </div>
            )}

          </div>
          {metrics.legacy && <><span className="preview-device__home" /><span className="preview-device__earpiece" /></>}
          {device.kind === "tablet" && <span className="preview-device__tablet-lens" />}
          {device.kind === "laptop" && <span className="preview-device__laptop-lens" />}
          {device.camera !== "none" && (
            <span className={"preview-device__camera preview-device__camera--" + device.camera} />
          )}
          {(device.kind === "phone" || device.kind === "foldable") && (
            <>
              <span className="preview-device__button preview-device__button--top" />
              <span className="preview-device__button preview-device__button--bottom" />
            </>
          )}
          {device.kind === "laptop" && <span className="preview-device__laptop-base" />}
          {device.kind === "desktop" && (
            <><span className="preview-device__stand" /><span className="preview-device__stand-foot" /></>
          )}
          {device.kind === "tv" && (
            <><span className="preview-device__tv-foot preview-device__tv-foot--left" /><span className="preview-device__tv-foot preview-device__tv-foot--right" /></>
          )}
        </div>
      </div>
    </div>
  );
}
