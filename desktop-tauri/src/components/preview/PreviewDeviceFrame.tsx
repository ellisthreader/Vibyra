import { useEffect, useMemo, useRef, useState } from "react";

import type {
  PreviewDevice,
  PreviewStatus,
  PreviewTarget,
  PreviewViewportState,
} from "../../previewTypes";
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

function frameMetrics(kind: PreviewDevice["kind"], width: number, height: number) {
  const bezel = kind === "phone" || kind === "foldable" ? 12 : kind === "tablet" ? 15 : 13;
  const extraWidth = kind === "laptop" ? 74 : 0;
  const extraHeight = kind === "laptop" ? 38 : kind === "desktop" ? 82 : kind === "tv" ? 54 : 0;
  return {
    bezel,
    shellWidth: width + bezel * 2,
    shellHeight: height + bezel * 2,
    outerWidth: width + bezel * 2 + extraWidth,
    outerHeight: height + bezel * 2 + extraHeight,
    offsetX: extraWidth / 2,
  };
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
  const sourceWidth = device.key === "custom" ? viewport.customWidth : device.width;
  const sourceHeight = device.key === "custom" ? viewport.customHeight : device.height;
  const width = viewport.landscape ? sourceHeight : sourceWidth;
  const height = viewport.landscape ? sourceWidth : sourceHeight;
  const metrics = useMemo(() => frameMetrics(device.kind, width, height), [device.kind, height, width]);
  const scale = Math.max(0.06, Math.min(1.25, fit * viewport.zoom));

  useEffect(() => {
    const host = stage.current;
    if (!host) return;
    const measure = () => {
      const rect = host.getBoundingClientRect();
      const next = Math.min(
        1,
        Math.max(0.06, (rect.width - 64) / metrics.outerWidth),
        Math.max(0.06, (rect.height - 64) / metrics.outerHeight),
      );
      setFit(next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    measure();
    return () => observer.disconnect();
  }, [metrics.outerHeight, metrics.outerWidth]);

  useEffect(() => onScaleChange(scale), [onScaleChange, scale]);
  useEffect(() => setLoaded(false), [revision, status.url]);

  const running = status.phase === "running" && status.url;
  const style = {
    "--device-w": width + "px",
    "--device-h": height + "px",
    "--device-bezel": metrics.bezel + "px",
    "--device-radius": device.radius + "px",
    "--screen-radius": device.screenRadius + "px",
    width: metrics.shellWidth,
    height: metrics.shellHeight,
    left: metrics.offsetX * scale,
    transform: "scale(" + scale + ")",
  } as React.CSSProperties;

  return (
    <div ref={stage} className="preview-stage">
      <div
        className="preview-stage__sizer"
        style={{ width: metrics.outerWidth * scale, height: metrics.outerHeight * scale }}
      >
        <div className={"preview-device preview-device--" + device.kind} style={style}>
          <div className="preview-device__screen">
            {running && (
              <iframe
                key={String(status.url) + "-" + revision}
                title={(target?.name ?? "Project") + " preview"}
                src={status.url ?? undefined}
                sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin allow-downloads"
                referrerPolicy="no-referrer"
                onLoad={() => setLoaded(true)}
              />
            )}
            {running && !loaded && (
              <div className="preview-device__loading">
                <span className="preview-spinner" />
                <strong>Loading project…</strong>
              </div>
            )}
            {!running && (
              <PreviewOverlay
                inspecting={inspecting}
                status={status}
                target={target}
                onRun={onRun}
                onRetryInspect={onRetryInspect}
              />
            )}
          </div>
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
