type Position = { offset: number; nearBottom: boolean };
const positions = new Map<string, Position>();

export function conversationScrollMemory(key: string): Position {
  const saved = positions.get(key);
  if (saved) {
    positions.delete(key);
    positions.set(key, saved);
    return saved;
  }
  const position = { offset: 0, nearBottom: true };
  positions.set(key, position);
  if (positions.size > 24) positions.delete(positions.keys().next().value!);
  return position;
}

export function clearConversationScrollMemory(prefix: string) {
  for (const key of positions.keys()) if (key.startsWith(prefix)) positions.delete(key);
}
