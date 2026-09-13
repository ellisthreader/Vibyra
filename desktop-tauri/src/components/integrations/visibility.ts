import type { IntegrationSnapshot } from "./types";

/**
 * A release can ship ahead of Vibyra's provider registrations. Until at least
 * one provider is configured there is nothing anyone could connect, so the
 * Integrations button stays hidden rather than offering nine dead rows. An
 * account that is already connected keeps it visible even if a registration
 * is later withdrawn, so existing access stays reviewable and removable.
 */
export function integrationsUsable(snapshot: IntegrationSnapshot): boolean {
  return snapshot.providers.some((p) => p.ready) || snapshot.connections.length > 0;
}
