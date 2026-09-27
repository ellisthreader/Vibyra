import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { PreviewDevicePicker } from './PreviewDevicePicker';
import type { PreviewDevice, PreviewInspection, PreviewStatus, PreviewTarget, PreviewViewportState } from '../../previewTypes';
import { RefreshPreviewIcon, RotateDeviceIcon } from './PreviewIcons';
import { PreviewShareControl } from './PreviewShareControl';

interface Props {
  inspection: PreviewInspection | null; target: PreviewTarget | null; targetId: string;
  status: PreviewStatus; statuses: Record<string, PreviewStatus>; device: PreviewDevice;
  viewport: PreviewViewportState; scale: number; onResetScope?: () => void; onAutomatic?: () => void;
  onTarget(id: string): void; onViewport(patch: Partial<PreviewViewportState>): void;
  onRefresh(): void; onRun(): void; onStop(): void;
  share?: { projectId: string; root: string; startPath?: string };
}
export function PreviewToolbar(props: Props) {
  const [error, setError] = useState('');
  const running = props.status.phase === 'running';
  const width = props.device.key === 'custom' ? props.viewport.customWidth : props.device.width;
  const height = props.device.key === 'custom' ? props.viewport.customHeight : props.device.height;
  return <div className="preview-controls">
    <PreviewDevicePicker device={props.device} onChange={key => props.onViewport({ deviceKey: key, landscape: false, zoom: 1 })} />
    <span className="preview-dimensions" title="CSS viewport size">{props.viewport.landscape ? height : width} × {props.viewport.landscape ? width : height}</span>
    <button className="icon-btn" title="Refresh preview" aria-label="Refresh preview" disabled={!running} onClick={props.onRefresh}><RefreshPreviewIcon /></button>
    <details className="preview-options"><summary aria-label="Preview options" title="Preview options">•••</summary>
      <div className="preview-options__body">
        {props.status.url && <button className="btn" onClick={() => {
          void invoke('preview_open_url', { url: props.status.url }).catch(e => setError(String(e)));
        }}>Open in browser ↗</button>}
        {props.onAutomatic && <button className="btn" onClick={props.onAutomatic}>Automatic preview</button>}
        {error && <small role="alert">{error}</small>}
        <button className="btn" onClick={() => props.onViewport({ landscape: !props.viewport.landscape })}><RotateDeviceIcon /> Rotate screen</button>
        {props.device.key === 'custom' && <div className="preview-custom-size"><input type="number" aria-label="Viewport width" min={240} max={7680} value={props.viewport.customWidth} onChange={e => props.onViewport({ customWidth: Number(e.target.value) })} /><span>×</span><input type="number" aria-label="Viewport height" min={240} max={4320} value={props.viewport.customHeight} onChange={e => props.onViewport({ customHeight: Number(e.target.value) })} /></div>}
        <div className="preview-zoom" role="group" aria-label="Preview zoom"><button aria-label="Zoom out" onClick={() => props.onViewport({ zoom: Math.max(.5, props.viewport.zoom - .1) })}>−</button><button title="Fit device" onClick={() => props.onViewport({ zoom: 1 })}>Fit · {Math.round(props.scale * 100)}%</button><button aria-label="Zoom in" onClick={() => props.onViewport({ zoom: Math.min(1.6, props.viewport.zoom + .1) })}>+</button></div>
        {(props.inspection?.targets.length ?? 0) > 1 && <label>Automatic source<select aria-label="Preview app" value={props.targetId} onChange={e => props.onTarget(e.target.value)}>{props.inspection?.targets.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
        {props.share && props.target && <PreviewShareControl projectId={props.share.projectId} root={props.share.root}
          target={props.target} startPath={props.share.startPath} />}
        {props.onResetScope && <button className="btn" onClick={props.onResetScope}>Use selected session</button>}
        {(running || props.status.phase === 'starting') && <button className="btn" onClick={props.onStop}>{props.targetId === 'manual-url' ? 'Disconnect' : props.status.phase === 'starting' ? 'Cancel' : 'Stop'}</button>}
        <small>If a site blocks embedding, use Open in browser. Exact CSS viewport, scaled to fit. Frames are visual references; browser chrome, native hardware and device pixel ratio aren’t emulated.</small>
      </div>
    </details>
  </div>;
}
