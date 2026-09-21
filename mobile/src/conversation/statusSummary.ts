const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
const human = (value: unknown) => typeof value === 'string' ? value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase()) : 'Not reported';
export function statusSummary(value: unknown) {
  const data = record(value), settings = record(data.settings), active = record(data.activeSettings), sandbox = record(settings.sandbox);
  const state = data.processState !== 'running' ? 'Saved conversation' : human(data.turnState);
  const permission = sandbox.type === 'dangerFullAccess' ? 'Full access' : sandbox.type === 'workspaceWrite' ? 'Workspace access'
    : sandbox.type === 'readOnly' ? 'Read only' : human(sandbox.type);
  return {
    state,
    rows: [
      ['Provider', 'Codex'], ['Account', 'Connected Codex account'], ['Model', String(settings.model ?? 'Not reported')],
      ['Reasoning effort', human(settings.effort)], ['Working directory', String(data.workingDirectory ?? 'Not reported')],
      ['Permissions', permission], ['Approval requests', settings.approvalPolicy === 'never' ? 'Automatically declined' : human(settings.approvalPolicy)],
      ['Control', data.controlOwner ? 'An authorized device has control' : 'Available'],
    ] as [string, string][],
    active: active.model ? `${active.model} · ${human(active.effort)}` : '',
  };
}
