import type { Pairing } from '../transport/pairing';

export type PairLinkDecision = 'pair' | 'confirm';

/**
 * What to do with a `vibyra://pair` link that arrived from outside the app (a camera scan, a
 * message, a web page). Only a link for the computer this phone already holds -- the same host id
 * and the same pinned key, which is how `connection.open` tells a reconnect from a switch -- may
 * connect at once. Anything else would clear the session and save a different pairing, so it waits
 * for the person to tap Pair with the computer's name in front of them. That includes a first
 * pairing: the link alone does not show whose computer it is.
 */
export function decidePairLink(
  current: Pick<Pairing, 'hostId' | 'publicKey'> | null | undefined,
  link: Pick<Pairing, 'hostId' | 'publicKey'>,
): PairLinkDecision {
  return current && current.hostId === link.hostId && current.publicKey === link.publicKey
    ? 'pair'
    : 'confirm';
}

const NAME_LIMIT = 40;
/** Line breaks and tabs read as a space; other control, zero-width and direction-override characters are dropped. */
const spacing = (n: number) => [0x09, 0x0a, 0x0d, 0x85, 0x2028, 0x2029].includes(n);
const hidden = (n: number) =>
  n <= 0x1f || (n >= 0x7f && n <= 0x9f) || (n >= 0x200b && n <= 0x200f) ||
  (n >= 0x202a && n <= 0x202e) || (n >= 0x2060 && n <= 0x206f) || n === 0xfeff;
/** A host name is chosen by whoever made the link, so it is shown as short, plain, single-line text. */
export function pairHostLabel(name: string): string {
  const plain = Array.from(name, (ch) => {
    const n = ch.codePointAt(0)!;
    return spacing(n) ? ' ' : hidden(n) ? '' : ch;
  })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return 'Unnamed computer';
  const letters = Array.from(plain);
  return letters.length > NAME_LIMIT ? `${letters.slice(0, NAME_LIMIT - 1).join('')}…` : plain;
}
