import type { VibesModel } from '../vibes/types';
import type { IconName } from './primitives';
import type { Project, Session, SessionKind } from './types';

// One selection list backs both composers, and every entry in it is an OpenRouter
// model. Auto is never a stored choice: each surface resolves it, so a phone that
// never opens the picker still starts a chat.
export const AUTO = 'auto';

export const computerAgents: { kind: SessionKind; name: string; short: string; detail: string; icon: IconName }[] = [
  { kind: 'claude', name: 'Claude Code', short: 'Claude', detail: 'Claude’s CLI, on your computer', icon: 'sparkles-outline' },
  { kind: 'codex', name: 'Codex', short: 'Codex', detail: 'The Codex CLI, on your computer', icon: 'code-slash-outline' },
  { kind: 'shell', name: 'Terminal', short: 'Terminal', detail: 'A plain shell, on your computer', icon: 'terminal-outline' },
];
// Curated models carry `released`, which earns the picker's "New" badge.
const NEW_MS = 90 * 24 * 60 * 60 * 1000;
export const isNewModel = (model: VibesModel, now = Date.now()) => {
  const released = model.released ? Date.parse(model.released) : NaN;
  return Number.isFinite(released) && now - released < NEW_MS;
};
export const autoAgent = (structured?: boolean): SessionKind => (structured ? 'codex' : 'claude');
export const agentName = (kind: SessionKind) => computerAgents.find(agent => agent.kind === kind)!.name;
export const modelLabel = (id: string, models: VibesModel[]) => models.find(model => model.id === id)?.name ?? 'Auto';

// The software picks the project so sending never opens a form: the most recent
// shared project, else the only one there is.
export function defaultProjectId(projects: Project[], sessions: Session[]) {
  const recent = sessions.find(session => projects.some(project => project.id === session.projectId));
  return recent?.projectId ?? projects[0]?.id ?? '';
}
export function sessionTitle(prompt: string, kind: SessionKind) {
  const first = prompt.trim().split('\n')[0]?.slice(0, 60).trim();
  return first || (kind === 'shell' ? 'Terminal' : `${agentName(kind)} chat`);
}
