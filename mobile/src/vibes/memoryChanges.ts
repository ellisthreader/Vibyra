import type { VibesTurn } from './types';

/**
 * What a reply changed in the person's memory, one line each, in the words the list
 * uses. Read defensively: the field is absent on an older server and on any turn
 * that changed nothing, and nothing here may throw on a shape it did not expect.
 */
export function memoryNotes(turn: Pick<VibesTurn, 'memory'>): string[] {
  const memory = turn.memory;
  if (!memory || typeof memory !== 'object') return [];
  const saved = Array.isArray(memory.saved) ? memory.saved.filter(item => typeof item?.text === 'string') : [];
  const forgotten = Array.isArray(memory.forgotten) ? memory.forgotten.filter(text => typeof text === 'string') : [];
  return [...saved.map(item => `Saved to memory: ${item.text}`), ...forgotten.map(text => `Removed from memory: ${text}`),
    ...(memory.full === true ? ['Memory is full. Remove a memory to save more.'] : [])];
}
