/**
 * How a number of Vibes is worded. The trial is three Vibes and a cheap reply
 * costs one, so the singular is not some edge of the range: it is what the chat
 * says most of the time, and "1 Vibes used" was on screen for every such reply.
 */
export const vibeWord = (count: number) => (count === 1 ? 'Vibe' : 'Vibes');
/** A balance or a price with its unit: "1 Vibe", "1,200 Vibes". */
export const vibes = (count: number) => `${count.toLocaleString()} ${vibeWord(count)}`;
