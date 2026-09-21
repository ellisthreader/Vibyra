export interface ConversationLayout { open: string[]; dismissed: string[] }
function conversationLayoutKey(account: string | null | undefined): string {
  return `terminal.conversations.layout.v1.${encodeURIComponent(account ?? 'guest')}`;
}
export function readConversationLayout(storage: Pick<Storage, 'getItem'>, account?: string | null): ConversationLayout {
  const raw = storage.getItem(conversationLayoutKey(account));
  if (!raw) {
    const legacy = JSON.parse(storage.getItem('terminal.conversations.dismissed') ?? '[]');
    return { open: [], dismissed: Array.isArray(legacy) ? legacy.filter(id => typeof id === 'string') : [] };
  }
  const value = JSON.parse(raw);
  if (!value || !Array.isArray(value.open) || !Array.isArray(value.dismissed)
    || [...value.open, ...value.dismissed].some(id => typeof id !== 'string')) throw new Error('Saved terminal layout could not be read.');
  return { open: [...new Set<string>(value.open)], dismissed: [...new Set<string>(value.dismissed)] };
}
export function writeConversationLayout(storage: Pick<Storage, 'setItem'>, account: string | null | undefined, layout: ConversationLayout): void {
  storage.setItem(conversationLayoutKey(account), JSON.stringify(layout));
}
