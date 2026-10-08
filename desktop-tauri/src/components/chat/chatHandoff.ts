import type { AgentItem } from '../../ipc/sharedChats';
import { launchConfigured } from '../../lib/configuredLaunch';
import { resolvedModelEffort } from '../../lib/modelEffort';
import type { CompanyModel } from './useCompanyModels';

/** The new chat's composer listens for this, since it may mount before or after the draft is written. */
export const HANDOFF_EVENT = 'vibyra:chat-handoff';
const LIMIT = 7000; // bytes; prompts must stay under 8 KB.
const clip = (text: string, size: number) => text.length > size ? `${text.slice(0, size).trimEnd()}…` : text;

/**
 * A short brief that lets another company's AI pick up where this chat left
 * off: the request, then the latest messages that fit, oldest first. It lands
 * as a draft, so you read it before anything is sent.
 */
export function handoffBrief(items: AgentItem[], from: string): string {
  const said = items.filter(item => item.kind === 'message' && item.text?.trim())
    .map(item => `${item.role === 'user' ? 'Me' : from}: ${clip(item.text!.trim().replace(/\n{3,}/g, '\n\n'), 900)}`);
  const head = `I'm moving this task over from ${from}. Here's our conversation so far, oldest first:\n\n`;
  const tail = '\n\nRead the project as it is now and carry on from here.';
  const kept: string[] = [];
  let size = new TextEncoder().encode(head + tail).length;
  for (const line of [...said].reverse()) {
    const bytes = new TextEncoder().encode(`${line}\n\n`).length;
    if (size + bytes > LIMIT) break;
    kept.unshift(line); size += bytes;
  }
  if (said[0] && kept[0] !== said[0]) {
    const first = clip(said[0], 400);
    if (size + new TextEncoder().encode(`${first}\n\n…\n\n`).length <= LIMIT) kept.unshift(first, '…');
  }
  return kept.length ? head + kept.join('\n\n') + tail : '';
}

/** Opens a chat on another company's model in the same project, carrying the brief as its draft. */
export async function switchCompany(target: CompanyModel, projectId: string, effort: string | null, brief: string) {
  const level = resolvedModelEffort(target.model, target.runner.id, (effort ?? 'medium') as never);
  const opened = await launchConfigured(target.runner, projectId, { model: target.launchModel, view: 'chat',
    reasoningEffort: (level ?? undefined) as never, reasoningEnabled: Boolean(level), title: target.model.label });
  const id = opened.map(session => 'conversationId' in session ? session.conversationId : null).find(Boolean);
  if (id && brief) {
    try { localStorage.setItem(`shared.draft.${id}`, brief); } catch { /* the event below still fills it */ }
    window.dispatchEvent(new CustomEvent(HANDOFF_EVENT, { detail: { sessionId: id, text: brief } }));
  }
  return Boolean(id);
}
