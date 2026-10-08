import { useState } from 'react';
import { commandLine, stateLine, type LocalView } from '../../lib/localMcp';
import type { McpServer } from '../../../../mobile/src/agents/v2/connectionsModel.ts';
import { needsReview } from '../../../../mobile/src/agents/v2/hubModel.ts';
import { McpTools } from './HubAccount';
import type { LocalMcp } from './useLocalMcp';
import type { MacHub } from './useMacHub';

/** One local server: how it is doing, its tools (reads are the person's choice), and its controls. */
export function LocalMcpServer({ view, server, hub, local, onEdit }: { view: LocalView; server: McpServer | undefined; hub: MacHub; local: LocalMcp; onEdit(): void }) {
  const [confirm, setConfirm] = useState(false);
  const { spec, status } = view, off = !spec.enabled, busy = local.busy !== null || hub.busy !== null;
  const review = server ? needsReview(server) : false;
  const tone = off ? 'muted' : status.state === 'running' ? 'ok' : status.state === 'failed' ? 'error' : 'muted';
  return <div className="hub-account local-mcp-server" aria-label={spec.name}>
    <div className="hub-account__head"><strong>{spec.name}</strong>
      <span className="local-mcp-chips">
        <span className={`hub-pill hub-pill--${tone}`}>{stateLine(view)}</span>
        {review ? <span className="hub-pill hub-pill--warn">Tools changed — review</span> : null}
        {spec.connectionId ? null : <span className="hub-pill hub-pill--muted">Not on your account yet</span>}
      </span></div>
    <code className="local-mcp-command" title={commandLine(spec)}>{commandLine(spec)}</code>
    {status.lastError && !off ? <small className="local-mcp-error">{status.lastError}</small> : null}
    {status.state === 'running' && status.protocolVersion ? <small>Speaking MCP {status.protocolVersion}</small> : null}
    {server ? <McpTools server={server} hub={hub} /> : spec.connectionId ? <small>Loading its tools…</small> : <small>Its tools appear here once it is on your account.</small>}
    {confirm ? <div className="hub-confirm" role="alert">
      <span>Remove {spec.name}? Every teammate loses access to it, and its saved secrets are deleted from this Mac.</span>
      <button type="button" className="btn btn--ghost" onClick={() => setConfirm(false)}>Keep</button>
      <button type="button" className="btn btn--danger" aria-label={`Confirm remove ${spec.name}`} disabled={busy} onClick={() => { setConfirm(false); void local.remove(spec.id); }}>Remove</button>
    </div> : <div className="hub-actions">
      {spec.connectionId ? null : <button type="button" className="btn btn--primary" aria-label={`Put ${spec.name} on your account`} disabled={busy || off} onClick={() => void local.connect(spec.id)}>Put on my account</button>}
      {status.state === 'failed' ? <button type="button" className="btn btn--ghost" aria-label={`Try ${spec.name} again`} disabled={busy} onClick={() => void local.retry(spec.id)}>Try again</button> : null}
      <button type="button" className="btn btn--ghost" aria-label={`${off ? 'Turn on' : 'Turn off'} ${spec.name}`} disabled={busy} onClick={() => void local.setEnabled(spec.id, off)}>{off ? 'Turn on' : 'Turn off'}</button>
      <button type="button" className="btn btn--ghost" aria-label={`Edit ${spec.name}`} disabled={busy} onClick={onEdit}>Edit</button>
      <button type="button" className="btn btn--ghost" aria-label={`Remove ${spec.name}`} disabled={busy} onClick={() => setConfirm(true)}>Remove</button>
    </div>}
  </div>;
}
