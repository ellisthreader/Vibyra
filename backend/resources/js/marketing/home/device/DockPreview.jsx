import React, { useLayoutEffect, useRef, useState } from "react";
import PreviewPanel from "./PreviewPanel.jsx";
import { previewFrameMetrics } from "./previewFrameMetrics.js";

const DEVICES = {
    phone: { key: "iphone-15", label: "iPhone 15", kind: "phone", width: 393, height: 852, radius: 52, screenRadius: 40, camera: "island" },
    tablet: { key: "ipad-air-11", label: "iPad Air 11-inch", kind: "tablet", width: 820, height: 1180, radius: 38, screenRadius: 28, camera: "none" },
    laptop: { key: "macbook-pro-14", label: "MacBook Pro 14-inch", kind: "laptop", width: 1512, height: 982, radius: 10, screenRadius: 2, camera: "none" },
    desktop: { key: "desktop", label: "Desktop · 1440 × 900", kind: "desktop", width: 1440, height: 900, radius: 8, screenRadius: 2, camera: "none" },
};

function DeviceIcon({ kind }) {
    const phone = kind === "phone";
    return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3">
        {phone ? <><rect x="5.5" y="2" width="9" height="16" rx="2" /><path d="M9 15.5h2" /></>
            : kind === "tablet" ? <><rect x="3.5" y="2" width="13" height="16" rx="2" /><path d="M9 15.5h2" /></>
            : kind === "laptop" ? <><rect x="3" y="3.5" width="14" height="10" rx="1" /><path d="m3 13.5-2 3h18l-2-3" /></>
            : <><rect x="2" y="3" width="16" height="11" rx="1" /><path d="M10 14v3m-4 0h8" /></>}
    </svg>;
}

function DeviceFrame({ device, width, height, scale, metrics, rotated, workspace, revision }) {
    const style = {
        "--device-w": `${width}px`, "--device-h": `${height}px`,
        "--device-bezel": `${metrics.bezel}px`, "--device-radius": `${device.radius}px`,
        "--screen-radius": `${device.screenRadius}px`,
        width: metrics.shellWidth, height: metrics.shellHeight,
        left: metrics.offsetX * scale, transform: `scale(${scale})`,
    };
    return <div className={`vdev-demo-device vdev-demo-device--${device.kind}`} data-model={device.key} data-landscape={rotated} style={style}>
        <div className="vdev-demo-device__screen">
            <PreviewPanel key={`${workspace.project.id}-${revision}`} workspace={workspace} compact={width < 600} device={device.kind} hideToolbar />
        </div>
        {device.camera !== "none" && <span className={`vdev-demo-device__camera vdev-demo-device__camera--${device.camera}`} aria-hidden="true" />}
        {device.kind === "phone" && <><span className="vdev-demo-device__button vdev-demo-device__button--top" aria-hidden="true" /><span className="vdev-demo-device__button vdev-demo-device__button--bottom" aria-hidden="true" /></>}
        {device.kind === "tablet" && <span className="vdev-demo-device__tablet-lens" aria-hidden="true" />}
        {device.kind === "laptop" && <><span className="vdev-demo-device__laptop-lens" aria-hidden="true" /><span className="vdev-demo-device__laptop-base" aria-hidden="true" /></>}
        {device.kind === "desktop" && <><span className="vdev-demo-device__stand" aria-hidden="true" /><span className="vdev-demo-device__stand-foot" aria-hidden="true" /></>}
    </div>;
}

// A real CSS viewport in the sample, without a dev server or external navigation.
export default function DockPreview({ data, run, onWrite }) {
    const [device, setDevice] = useState("phone");
    const [rotated, setRotated] = useState(false);
    const [revision, setRevision] = useState(0);
    const [zoom, setZoom] = useState(1);
    const [running, setRunning] = useState(true);
    const [bounds, setBounds] = useState({ width: 360, height: 650 });
    const stage = useRef(null);
    useLayoutEffect(() => {
        const observer = new ResizeObserver(([entry]) => setBounds({ width: entry.contentRect.width, height: entry.contentRect.height }));
        observer.observe(stage.current);
        return () => observer.disconnect();
    }, []);
    const viewport = DEVICES[device];
    const width = rotated ? viewport.height : viewport.width;
    const height = rotated ? viewport.width : viewport.height;
    const metrics = previewFrameMetrics(viewport, width, height);
    // ResizeObserver's content box already excludes the stage padding.
    const fit = Math.min(1, Math.max(.02, bounds.width / metrics.outerWidth), Math.max(.02, bounds.height / metrics.outerHeight));
    const scale = Math.max(.02, Math.min(1.25, fit * zoom));
    const workspace = { project: data, run, update: action => onWrite(action.name, action.value) };
    return <div className="vdev-preview" data-device={device} data-rotated={rotated}>
        <div className="vdev-preview-address"><span><i className={running ? "" : "is-stopped"} />{running ? "localhost:3000" : "Preview stopped"}</span><span>Sample app</span></div>
        <div className="vdev-preview-controls">
            <div className="vdev-preview-device-select"><DeviceIcon kind={viewport.kind} />
                <select value={device} aria-label="Preview device" onChange={event => { setDevice(event.target.value); setRotated(false); setZoom(1); }}>
                    {Object.entries(DEVICES).map(([id, value]) => <option key={id} value={id}>{value.label}</option>)}
                </select>
                <svg className="vdev-preview-device-chevron" aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor"><path d="m5 6 3 3 3-3" /></svg>
            </div>
            <span className="vdev-preview-dimensions" title="CSS viewport size">{width} × {height}</span>
            <button type="button" className="vdev-icon-btn" aria-label="Refresh preview" disabled={!running} onClick={() => setRevision(value => value + 1)}>↻</button>
            <details className="vdev-preview-options" onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector("summary").focus(); } }}>
                <summary aria-label="Preview options" title="Preview options">•••</summary>
                <div className="vdev-preview-options-body">
                    <button type="button" onClick={() => setRotated(value => !value)}>Rotate screen</button>
                    <div className="vdev-preview-zoom" role="group" aria-label="Preview zoom">
                        <button type="button" aria-label="Zoom out" onClick={() => setZoom(value => Math.max(.5, Math.round((value - .1) * 10) / 10))}>−</button>
                        <button type="button" onClick={() => setZoom(1)}>Fit · {Math.round(scale * 100)}%</button>
                        <button type="button" aria-label="Zoom in" onClick={() => setZoom(value => Math.min(1.6, Math.round((value + .1) * 10) / 10))}>+</button>
                    </div>
                    <button type="button" onClick={event => { setRunning(value => !value); event.currentTarget.closest("details").open = false; }}>{running ? "Stop preview" : "Start preview"}</button>
                    <small>Try the sample website at different CSS sizes. No local server is running.</small>
                </div>
            </details>
        </div>
        <div className="vdev-preview-viewport" ref={stage}>
            {running ? <div className="vdev-preview-sizer" style={{ width: metrics.outerWidth * scale, height: metrics.outerHeight * scale }}>
                <DeviceFrame device={viewport} width={width} height={height} scale={scale} metrics={metrics} rotated={rotated} workspace={workspace} revision={revision} />
            </div> : <div className="vdev-preview-stopped"><strong>Preview is stopped</strong><p>{data.name} · sample app</p><button type="button" onClick={() => setRunning(true)}>Start preview</button></div>}
        </div>
    </div>;
}
