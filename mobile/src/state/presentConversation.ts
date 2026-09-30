import type { ConversationItem, RequestStatus } from '../conversation/types';
import type { AgentItem } from './conversationTypes';

export function presentConversation(items: AgentItem[]): ConversationItem[] {
  return items
    .filter(
      (item) =>
        item.kind !== 'result' || ['completed', 'failed', 'interrupted'].includes(item.status),
    )
    .map((item) => {
      const identity = { id: item.id, turnId: item.turnId ?? item.id };
      if (item.kind === 'message')
        return {
          ...identity,
          kind: 'message',
          source: item,
          role: item.role ?? 'assistant',
          text: `${item.text ?? ''}${item.attachments?.length ? '\n\n' + item.attachments.map((a) => `▧ ${a.name} · Sent`).join('\n') : ''}${item.truncated ? '\n\n[Message shortened by the computer]' : ''}`,
        };
      if (item.kind === 'activity')
        return {
          ...identity,
          kind: 'activity',
          source: item,
          title: item.title ?? 'Working',
          detail: `${item.detail ?? ''}${item.truncated ? '\n[Output shortened by the computer]' : ''}`,
          status: (['completed', 'failed', 'interrupted', 'declined'].includes(item.status)
            ? item.status
            : 'running') as 'completed' | 'failed' | 'interrupted' | 'declined' | 'running',
        };
      if (item.kind === 'permission')
        return {
          ...identity,
          kind: 'permission',
          title: item.title ?? 'Permission needed',
          reason: item.text,
          detail: item.detail,
          source: item,
          allowLabel: item.allowLabel,
          choices: item.choices,
          scope: `${item.decisionScope === 'acceptForSession' ? 'This session' : item.decisionScope === 'acceptForProject' ? 'Saved project command rule' : item.allowLabel === 'Allow for this turn' ? 'This turn' : 'This action only'}${item.scope ? ` · ${item.scope}` : ''}`,
          status: requestStatus(item.status),
        };
      if (item.kind === 'question')
        return {
          ...identity,
          kind: 'question',
          title: item.title ?? 'Your input is needed',
          status: requestStatus(item.status),
          questions: (item.questions ?? []).map((question) => ({
            id: question.id,
            prompt: question.question,
            options: (question.options ?? []).map((option) => ({ ...option, id: option.label })),
            allowFreeform: question.isOther === true || !question.options?.length,
            secret: question.isSecret,
          })),
        };
      return {
        ...identity,
        kind: 'result',
        source: item,
        text: item.text ?? item.title ?? 'Task finished',
        status:
          item.status === 'failed'
            ? 'failed'
            : item.status === 'interrupted'
              ? 'interrupted'
              : 'completed',
      };
    });
}
function requestStatus(value: string): RequestStatus {
  if (value === 'responding') return 'resolving';
  if (['pending', 'accepted', 'declined', 'expired', 'unknown'].includes(value))
    return value as RequestStatus;
  return value === 'completed' ? 'accepted' : 'unknown';
}
