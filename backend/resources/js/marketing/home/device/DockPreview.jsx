import React, { useLayoutEffect, useRef, useState } from "react";
import PreviewPanel from "./PreviewPanel.jsx";

const DEVICES = {
    responsive: { label: "Responsive" },
    laptop: { label: 'MacBook Pro 14"', width: 1512, height: 982 },
    tablet: { label: 'iPad Air', width: 820, height: 1180 },
    phone: { label: "iPhone 15", width: 393, height: 852 },
};

// A real CSS viewport in the sample, without a dev server or external navigation.
export default function DockPreview({ data, run, onWrite }) {
    const [device, setDevice] = useState("responsive");
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
    const width = device === "responsive" ? Math.max(240, Math.round(bounds.width)) : rotated ? viewport.height : viewport.width;
    const height = device === "responsive" ? Math.max(240, Math.round(bounds.height)) : rotated ? viewport.width : viewport.height;
    const scale = (device === "responsive" ? 1 : Math.min(bounds.width / width, bounds.height / height, 1)) * zoom;
    const workspace = { project: data, run, update: action => onWrite(action.name, action.value) };
    return <div className="vdev-preview" data-device={device} data-rotated={rotated}>
        <div className="vdev-preview-address"><span><i className={running ? "" : "is-stopped"} />{running ? "localhost:3000" : "Preview stopped"}</span><span>Sample app</span></div>
        <div className="vdev-preview-controls">
            <select value={device} aria-label="Preview device" onChange={event => { setDevice(event.target.value); setRotated(false); setZoom(1); }}>
                {Object.entries(DEVICES).map(([id, value]) => <option key={id} value={id}>{value.label}</option>)}
            </select>
            <span className="vdev-preview-dimensions" title="CSS viewport size">{width} × {height}</span>
            <button type="button" className="vdev-icon-btn" aria-label="Refresh preview" disabled={!running} onClick={() => setRevision(value => value + 1)}>↻</button>
            <details className="vdev-preview-options" onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector("summary").focus(); } }}>
                <summary aria-label="Preview options" title="Preview options">•••</summary>
                <div className="vdev-preview-options-body">
                    <button type="button" disabled={device === "responsive"} onClick={() => setRotated(value => !value)}>Rotate screen</button>
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
            {running ? <div className="vdev-preview-sizer" style={{ width: width * scale, height: height * scale }}><div className="vdev-preview-canvas" style={{ width, height, transform: `scale(${scale})` }}>
                <PreviewPanel key={`${data.id}-${revision}`} workspace={workspace} compact={width < 600} device={device === "phone" && !rotated ? "phone" : "laptop"} hideToolbar />
            </div></div> : <div className="vdev-preview-stopped"><strong>Preview is stopped</strong><p>{data.name} · sample app</p><button type="button" onClick={() => setRunning(true)}>Start preview</button></div>}
        </div>
    </div>;
}
