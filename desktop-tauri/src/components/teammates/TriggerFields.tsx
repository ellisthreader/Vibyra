import type { Connection, TriggerDraft } from '../../../../mobile/src/agents/v2/triggersModel.ts';

/** The saved filter for one trigger kind. The model never chooses these. */
export function TriggerFields({ draft: d, update, connections, disabled }: {
  draft: TriggerDraft; update(patch: Partial<TriggerDraft>): void; connections: Connection[] | null; disabled: boolean;
}) {
  const provider = d.kind === 'gmail.message' ? 'gmail' : d.kind === 'calendar.event_soon' ? 'google_calendar' : null;
  const accounts = (connections ?? []).filter(c => c.provider === provider && c.health === 'healthy');
  const field = (label: string, key: keyof TriggerDraft, props: Record<string, unknown> = {}) =>
    <label>{label}<input value={String(d[key])} disabled={disabled} spellCheck={false} {...props}
      onChange={e => update({ [key]: props.type === 'number' ? Number(e.target.value) : e.target.value } as Partial<TriggerDraft>)} /></label>;
  return <div className="routine-row routine-fields">
    {d.kind.startsWith('github.') && <>
      {field('Repository', 'repository', { placeholder: 'owner/repo (any if empty)', maxLength: 201 })}
      {field('Actions', 'actions', { placeholder: 'opened, reopened' })}
      {field('Labels (any of)', 'labels', { placeholder: 'bug, urgent' })}
    </>}
    {d.kind === 'stripe.event' && <>
      {field('Event types', 'types', { placeholder: 'invoice.paid, customer.*' })}
      {field('Signing secret', 'signingSecret', { type: 'password', placeholder: 'whsec_… (you can add it later)', autoComplete: 'off' })}
    </>}
    {provider && <label>Account<select value={d.connectionId} disabled={disabled || !accounts.length} onChange={e => update({ connectionId: e.target.value })}>
      <option value="">{connections === null ? 'Loading accounts…' : accounts.length ? 'Choose an account' : 'No connected account'}</option>
      {accounts.map(c => <option key={c.id} value={c.id}>{c.account}</option>)}
    </select></label>}
    {d.kind === 'gmail.message' && <>
      {field('Search filter', 'query', { placeholder: 'from:billing@example.com', maxLength: 150 })}
      {field('Check every (minutes)', 'pollMinutes', { type: 'number', min: 1, max: 60 })}
    </>}
    {d.kind === 'calendar.event_soon' && <>
      {field('Calendar', 'calendarId', { placeholder: 'primary' })}
      {field('Minutes before', 'leadMinutes', { type: 'number', min: 5, max: 240 })}
    </>}
  </div>;
}
