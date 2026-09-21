import { usageSummary } from '../../../../mobile/src/conversation/usageSummary';
export function ConversationUsage({ value }: { value: unknown }) {
  const usage = usageSummary(value);
  return <div className="conversation-usage"><p className="inspector-muted">Your connected Codex account</p>
    {usage.groups.map(group => <section key={group.name}><h3>{group.name}</h3>{group.windows.map(window => <div className="usage-window" key={window.label}>
      <div><span>{window.label}</span><small>{window.used}% used</small></div><meter min={0} max={100} value={window.used} aria-label={window.label} />
      {window.resetsAt && <small>Resets {new Date(window.resetsAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</small>}
    </div>)}</section>)}
    {!usage.groups.length && <p className="inspector-muted">{usage.note || 'Account limits are not available.'}</p>}
    <section><h3>This conversation</h3>{usage.tokens.map(token => <div className="usage-token" key={token.label}><span>{token.label}</span><strong>{token.value}</strong></div>)}
      {!usage.tokens.length && <p className="inspector-muted">Token counts have not been reported yet.</p>}</section>
    <p className="inspector-muted">Account limits and conversation tokens are separate. Daily and lifetime token history is not exposed by this provider.</p>
  </div>;
}
