import type { WorkspaceModel, Project } from '../ui/types';
import type { VibesChat } from '../vibes/types';
import { fallbackIntegrations } from './catalogue';
import { deviceIntegrations, railwayProject, vaultProject } from './deviceIntegrations';
import { mentionedIds } from './mentions';
import type { Integration } from './types';

export const referenceIds = [...fallbackIntegrations.map(app => app.id), 'obsidian', 'railway'];

/** Device references use an approved project binding, never a server connector slug. */
export function chatReferences(text: string, installed: Integration[], workspace: WorkspaceModel,
  chat?: VibesChat, allowed?: string[]) {
  const devices = allowed ? [] : deviceIntegrations(workspace);
  const available = [...installed.filter(app => !allowed || allowed.includes(app.id)),
    ...devices.filter(app => app.installed && workspace.vibesToolsAvailable && !workspace.viewOnly)];
  const named = mentionedIds(text, referenceIds);
  const missing = named.find(id => !available.some(app => app.id === id));
  let issue: string | null = missing ? allowed && !allowed.includes(missing)
    ? `@${missing} is not enabled for this teammate.`
    : `Connect ${missing === 'github' ? 'GitHub' : missing === 'obsidian' ? 'Obsidian' : missing === 'railway' ? 'Railway' : missing === 'figma' ? 'Figma' : 'Stripe'} in Integrations before sending this reference.` : null;
  const local = named.filter(id => id === 'obsidian' || id === 'railway');
  let project: Project | null = null;
  if (local.length > 1) issue = 'Use Obsidian and Railway in separate messages. Each chat can use one computer project at a time.';
  else if (local.length && !issue) {
    const target = local[0] === 'obsidian' ? vaultProject(workspace) : railwayProject(workspace);
    if (target && (chat?.host_id !== workspace.host?.id || chat?.project_id !== target.id || !chat?.binding)) project = target;
  }
  return { available, issue, project, device: local[0],
    connectors: named.filter(id => installed.some(app => app.id === id) && (!allowed || allowed.includes(id))) };
}

export function missingQuotedReferences(requested: string[], accepted?: string[]): boolean {
  return accepted !== undefined && requested.some(id => !accepted.includes(id));
}
