/**
 * Where one Vibes draft is kept. Shared so that anything prefilling the composer -
 * an integration saying "use it in a chat", for instance - writes to the same place the
 * composer will read from, rather than to a key that only looks the same.
 */
export const vibesDraftKey = (email: string | null | undefined, scope: string) =>
  'vibes:' + (email ?? 'guest') + ':' + scope;
