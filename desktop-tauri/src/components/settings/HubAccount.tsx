import { useState } from 'react';
import type { HubConnection, McpServer } from '../../../../mobile/src/agents/v2/connectionsModel.ts';
import { MCP_READ_WARNING, STATUS_PILL, accountTitle, lastUsedLine, markableReads, mentionsNote, needsReview, reviewSummary, teammatesLine, toolLabel } from '../../../../mobile/src/agents/v2/hubModel.ts';
import type { MacHub } from './useMacHub';

/** One connected account in the Mac hub. Disconnect confirms inside the row, never window.confirm. */
export function HubAccount({ c, hub }: { c: HubConnection; hub: MacHub }) {
  const [confirm, setConfirm] = useState(false);
  const pill = STATUS_PILL[c.status];
  const title = accountTitle(c);
  const server = c.mcp ? hub.servers[c.id] : undefined;
  return <div className="hub-account">
    <div className="hub-account__head">
      <strong>{title}</strong>
      <span className={`hub-pill hub-pill--${pill.tone}`}>{pill.label}</span>
    </div>
    <small>{teammatesLine(c)} · {lastUsedLine(c.lastUsedAt)}</small>
    {mentionsNote(c) ? <small>{mentionsNote(c)}</small> : null}
    {server ? <McpTools server={server} hub={hub} /> : null}
    {confirm ? <div className="hub-confirm" role="alert">
      <span>Disconnect {title}?{c.teammates.length ? ' Every teammate loses access to it.' : ''}{c.source === 'install' ? ' Chats lose it too.' : ''}</span>
      <button type="button" className="btn btn--ghost" onClick={() => setConfirm(false)}>Keep</button>
      <button type="button" className="btn btn--danger" aria-label={`Confirm disconnect ${title}`} disabled={hub.busy !== null}
        onClick={() => { setConfirm(false); void hub.disconnect(c); }}>Disconnect</button>
    </div> : <div className="hub-actions">
      {c.reconnect ? <button type="button" className="btn btn--primary" aria-label={`Reconnect ${title}`} disabled={hub.busy !== null}
        onClick={() => void hub.reconnect(c)}>{hub.busy === `reconnect:${c.id}` ? 'Waiting for browser…' : 'Reconnect'}</button> : null}
      <button type="button" className="btn btn--ghost" aria-label={`Disconnect ${title}`} disabled={hub.busy !== null} onClick={() => setConfirm(true)}>Disconnect</button>
    </div>}
  </div>;
}

/** MCP tools: writes ask each time; only server-annotated read-only tools can be marked as reads. */
export function McpTools({ server, hub }: { server: McpServer; hub: MacHub }) {
  const id = server.connectionId;
  const reads = server.tools.filter(t => t.kind === 'read').map(t => t.tool);
  return <div className="hub-mcp">
    {needsReview(server) ? <div className="hub-review">
      <p>{reviewSummary(server)}</p>
      <ul>
        {server.pending?.tools.map(t => <li key={t.tool}>{server.pending!.added.includes(t.tool) ? 'New · ' : server.pending!.changed.includes(t.tool) ? 'Changed · ' : ''}{toolLabel(t.tool)}{t.description ? ` — ${t.description}` : ''}</li>)}
        {server.pending?.removed.map(t => <li key={t}>Removed · {toolLabel(t)}</li>)}
      </ul>
      <button type="button" className="btn btn--primary" aria-label={`Approve tool list for ${server.name}`} disabled={hub.busy !== null || !server.pending}
        onClick={() => void hub.mcpApprove(server)}>Approve new tool list</button>
    </div> : null}
    {server.status === 'pending_auth' ? <small>Sign in to this server to list its tools.</small> : null}
    {server.tools.map(t => <label key={t.tool} className={`hub-tool${t.readOnlyHint ? '' : ' hub-tool--locked'}`}>
      <span><strong>{toolLabel(t.tool)}</strong><small>{t.kind === 'read' ? 'Read · runs without asking' : 'Asks you each time'}{t.description ? ` · ${t.description}` : ''}</small></span>
      {t.readOnlyHint ? <input type="checkbox" aria-label={`Treat ${toolLabel(t.tool)} as a read`} checked={t.kind === 'read'} disabled={hub.busy !== null}
        onChange={e => void hub.mcpReads(id, e.target.checked ? [...reads, t.tool] : reads.filter(x => x !== t.tool))} /> : null}
    </label>)}
    {markableReads(server).length > 0 ? <small className="hub-mcp__note">{MCP_READ_WARNING}</small> : null}
    <button type="button" className="btn btn--ghost" aria-label={`Check ${server.name} for changes`} disabled={hub.busy !== null}
      onClick={() => void hub.mcpRefresh(id)}>Check for changes</button>
  </div>;
}
