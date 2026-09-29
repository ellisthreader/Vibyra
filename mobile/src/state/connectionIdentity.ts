import type { Pairing } from '../transport/pairing';

export const throughCloud = (pairing: Pairing) => pairing.route === 'relay';
export function addressOf(pairing: Pairing) {
  if (throughCloud(pairing)) return null;
  try { return new URL(pairing.url).host || null; } catch { return null; }
}
/** Grants and admission identifiers are single-connection values. Persist
 * only the pinned identity and route needed to request fresh authorization. */
export function withoutInvite(pairing: Pairing): Pairing {
  const { invite: _invite, expiresAt: _expires, relayToken: _grant,
    remoteSessionId: _session, remoteAuthorizationId: _authorization, ...remembered } = pairing;
  return remembered;
}
