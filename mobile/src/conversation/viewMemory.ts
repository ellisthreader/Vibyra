import type { ConversationAttachment } from './attachmentUpload';
interface ViewMemory { answers: Record<string, Record<string, string>>; questions: Record<string, { selected: Record<string,string>; written: Record<string,string> }>; selection?: { start: number; end: number }; expanded: Record<string, boolean>; steps: Record<string, boolean>; offset: number; following: boolean; attachments: ConversationAttachment[] }
const views = new Map<string, ViewMemory>();
/** Small navigation cache; provider history remains authoritative and secret answers are excluded. */
export function conversationViewMemory(key: string): ViewMemory {
  let memory = views.get(key);
  if (!memory) {
    memory = { answers: {}, questions: {}, expanded: {}, steps: {}, offset: 0, following: true, attachments: [] }; views.set(key, memory);
    if (views.size > 24) views.delete(views.keys().next().value!);
  }
  return memory;
}
