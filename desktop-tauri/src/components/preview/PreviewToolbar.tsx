import { PREVIEW_DEVICES } from "../../lib/previewDevices";
import type {
  PreviewDevice,
  PreviewInspection,
  PreviewStatus,
  PreviewTarget,
  PreviewViewportState,
} from "../../previewTypes";
import { RefreshPreviewIcon, RotateDeviceIcon } from "./PreviewIcons";
import { PreviewPicker, type PreviewPickerOption } from "./PreviewPicker";

interface Props {
  inspection: PreviewInspection | null;
  target: PreviewTarget | null;
  targetId: string;
  status: PreviewStatus;
  statuses: Record<string, PreviewStatus>;
  device: PreviewDevice;
  viewport: PreviewViewportState;
  scale: number;
  onTarget: (id: string) => void;
  onViewport: (patch: Partial<PreviewViewportState>) => void;
  onRefresh: () => void;
  onRun: () => void;
  onStop: () => void;
}

const phaseLabel: Record<PreviewStatus["phase"], string> = {
  idle: "Ready",
  starting: "Starting",
  running: "Running",
  failed: "Failed",
  stopped: "Stopped",
};

export function PreviewToolbar(props: Props) {
  const targetOptions: PreviewPickerOption[] = (props.inspection?.targets ?? []).map((target) => {
    const phase = props.statuses[target.id]?.phase;
    const state = phase === "starting"
      ? "Starting"
      : phase === "running"
        ? "Running"
        : !target.runnable
          ? "Unavailable"
          : "";
    const detail = target.relativeRoot === "." ? target.framework : target.relativeRoot;
    return {
      key: target.id,
      label: target.name,
      meta: state ? state + " · " + detail : detail,
    };
  });
  const deviceOptions: PreviewPickerOption[] = PREVIEW_DEVICES.map((entry) => ({
    key: entry.key,
    label: entry.label,
    group: entry.group,
    meta: entry.key === "custom"
      ? "Set any CSS viewport"
      : entry.width + " × " + entry.height + " CSS px · " + entry.dpr + "× DPR ref",
  }));
  const running = props.status.phase === "running";
  const starting = props.status.phase === "starting";
  const canRun = Boolean(props.target?.runnable) && !starting;

  return (
    <div className="preview-toolbar">
      <div className="preview-toolbar__group">
        <span className="preview-toolbar__label">App</span>
        <PreviewPicker
          label="Preview app"
          value={props.targetId}
          options={targetOptions}
          onChange={props.onTarget}
        />
      </div>
      <span className="preview-toolbar__divider" />
      <div className="preview-toolbar__group">
        <span className="preview-toolbar__label">Device</span>
        <PreviewPicker
          label="Preview device"
          value={props.viewport.deviceKey}
          options={deviceOptions}
          onChange={(deviceKey) => props.onViewport({ deviceKey })}
        />
        <button
          className="icon-btn preview-toolbar__icon"
          title="Rotate device"
          aria-label="Rotate device"
          onClick={() => props.onViewport({ landscape: !props.viewport.landscape })}
        >
          <RotateDeviceIcon />
        </button>
      </div>
      {props.device.key === "custom" && (
        <div className="preview-custom-size" aria-label="Custom viewport size">
          <input
            type="number"
            min={240}
            max={7680}
            value={props.viewport.customWidth}
            aria-label="Viewport width"
            onChange={(event) => props.onViewport({ customWidth: Number(event.target.value) })}
          />
          <span>×</span>
          <input
            type="number"
            min={240}
            max={4320}
            value={props.viewport.customHeight}
            aria-label="Viewport height"
            onChange={(event) => props.onViewport({ customHeight: Number(event.target.value) })}
          />
        </div>
      )}
      <span className="preview-toolbar__spacer" />
      <div className="preview-zoom" aria-label="Preview zoom">
        <button
          aria-label="Zoom out"
          onClick={() => props.onViewport({ zoom: Math.max(0.5, props.viewport.zoom - 0.1) })}
        >
          −
        </button>
        <button
          className="preview-zoom__fit"
          title="Fit device"
          onClick={() => props.onViewport({ zoom: 1 })}
        >
          {Math.round(props.scale * 100)}%
        </button>
        <button
          aria-label="Zoom in"
          onClick={() => props.onViewport({ zoom: Math.min(1.6, props.viewport.zoom + 0.1) })}
        >
          +
        </button>
      </div>
      <button
        className="icon-btn preview-toolbar__icon"
        title="Refresh preview"
        aria-label="Refresh preview"
        disabled={!running}
        onClick={props.onRefresh}
      >
        <RefreshPreviewIcon />
      </button>
      <span className={"preview-status preview-status--" + props.status.phase}>
        <i />
        {phaseLabel[props.status.phase]}
      </span>
      {running ? (
        <button className="btn preview-stop" onClick={props.onStop}>Stop</button>
      ) : (
        <button
          className="btn btn--primary preview-run"
          disabled={!canRun}
          onClick={props.onRun}
        >
          {starting ? "Starting…" : "Run preview"}
        </button>
      )}
    </div>
  );
}
