import { chatRequest, type AgentItem } from '../../ipc/sharedChats';

// Persist before dispatch. An IPC timeout or webview reload must never invent a
// second submission for an action the computer may already have accepted.
export async function sendPrompt(sessionId: string, text: string, sendAsText = false, attachments: string[] = []) {
  if (!text.trim() || new TextEncoder().encode(text).length > 8192) throw new Error('Use a prompt under 8 KB. Your draft is kept.');
  const key = `shared.pending.${sessionId}`;
  const previous = localStorage.getItem(key);
  if (previous) {
    const receipt = await chatRequest('turn.submissionStatus', { sessionId, submissionId: previous });
    if (receipt.status === 'accepted') {
      localStorage.removeItem(key);
      throw new Error('Your previous message was delivered. Review it above before sending another.');
    }
    if (receipt.status !== 'notFound' && receipt.status !== 'failed') {
      throw new Error('Delivery is uncertain. Check this chat before repeating the task.');
    }
    localStorage.removeItem(key);
  }
  const submissionId = crypto.randomUUID();
  localStorage.setItem(key, submissionId);
  const receipt = await chatRequest('turn.submit', { sessionId, submissionId, text, sendAsText, attachments });
  if (receipt.status === 'failed') {
    localStorage.removeItem(key);
    throw new Error(String(receipt.message ?? 'The agent could not start this task.'));
  }
  if (receipt.status !== 'accepted') throw new Error('Delivery is uncertain. Your draft is kept.');
  localStorage.removeItem(key);
}
export async function answerRequest(sessionId: string, item: AgentItem,
  response: { decision: 'accept' | 'decline' | 'acceptForSession' | 'acceptForProject' } | { answers: Record<string, { answers: string[] }> }) {
  const key = `shared.decision.${sessionId}.${item.requestId}`;
  const decisionId = localStorage.getItem(key) ?? crypto.randomUUID();
  localStorage.setItem(key, decisionId);
  await chatRequest('decision' in response ? 'decision.resolve' : 'question.answer', {
    sessionId, turnId: item.turnId, requestId: item.requestId, actionVersion: item.actionVersion, decisionId, ...response,
  });
}
