import React, { useState } from "react";
import PreviewPanel from "./PreviewPanel.jsx";

const DEVICES = {
    laptop: { label: 'MacBook Pro 14"', width: 1512, height: 982 },
    phone: { label: "iPhone 15", width: 393, height: 852 },
};

// The preview is a sample browser viewport, not a running local dev server.
export default function DockPreview({ data, run, onWrite }) {
    const [device, setDevice] = useState("laptop");
    const [rotated, setRotated] = useState(false);
    const [revision, setRevision] = useState(0);
    const [zoom, setZoom] = useState(1);
    const viewport = DEVICES[device];
    const width = rotated ? viewport.height : viewport.width;
    const height = rotated ? viewport.width : viewport.height;
    const workspace = { project: data, run, update: (action) => onWrite(action.name, action.value) };
    return <div className="vdev-preview" data-device={device} data-rotated={rotated} style={{ "--preview-zoom": zoom }}>
        <div className="vdev-preview-address"><span><i />Live sample preview</span><span>localhost · demo</span></div>
        <div className="vdev-preview-controls">
            <select value={device} aria-label="Preview device" onChange={(event) => { setDevice(event.target.value); setRotated(false); }}>
                {Object.entries(DEVICES).map(([id, value]) => <option key={id} value={id}>{value.label}</option>)}
            </select>
            <span className="vdev-preview-dimensions" title="CSS viewport size">{width} × {height}</span>
            <button type="button" className="vdev-icon-btn" aria-label="Refresh preview" onClick={() => setRevision((value) => value + 1)}>
                ↻
            </button>
            <details className="vdev-preview-options">
                <summary aria-label="Preview options" title="Preview options">•••</summary>
                <div className="vdev-preview-options-body">
                    <button type="button" onClick={() => setRotated((value) => !value)}>Rotate screen</button>
                    <div className="vdev-preview-zoom" role="group" aria-label="Preview zoom">
                        <button type="button" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.7, Math.round((value - 0.1) * 10) / 10))}>−</button>
                        <button type="button" onClick={() => setZoom(1)}>Fit · {Math.round(zoom * 100)}%</button>
                        <button type="button" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(1.3, Math.round((value + 0.1) * 10) / 10))}>+</button>
                    </div>
                    <small>Responsive layout preview. Device chrome and hardware are illustrative.</small>
                </div>
            </details>
        </div>
        <PreviewPanel key={revision} workspace={workspace} compact device={device} />
    </div>;
}
