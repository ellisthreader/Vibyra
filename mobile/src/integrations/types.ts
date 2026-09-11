/**
 * How an integration is connected. `oauth` signs in on the provider's own page;
 * `token` (and an older server that sends no kind) is a pasted key, described by
 * the rest of these fields.
 */
export interface IntegrationCredential { kind?: 'token' | 'oauth'; label: string; placeholder: string; help: string; url: string }
export interface Integration {
  id: string;
  /** What to type in a message to point a reply at this integration, `@github`. */
  mention: string;
  name: string; tagline: string; blurb: string; category: string;
  abilities: string[];
  /** Plainly what the integration can see, and what it may change. `writes` null means nothing. */
  reads: string | null; writes: string | null;
  credential: IntegrationCredential;
  installed: boolean;
  account: string | null; connectedAt: string | null;
}
/** `enabled` is the server's own switch. The list is readable either way. */
export interface IntegrationCatalogue { enabled: boolean; integrations: Integration[] }
/** A sign-in begun on the server: the provider's page to open, and the flow to read back. */
export interface IntegrationFlow { flowId: string; url: string }
export interface IntegrationFlowState { status: 'pending' | 'connected' | 'failed' | 'expired'; error?: string; catalogue: IntegrationCatalogue }
export interface IntegrationsApi {
  catalogue(): Promise<IntegrationCatalogue>;
  connect(id: string, credential: string): Promise<IntegrationCatalogue>;
  disconnect(id: string): Promise<IntegrationCatalogue>;
  /** Begin a sign-in on the provider's page; the browser returns to `returnUrl`. */
  start?(id: string, returnUrl: string): Promise<IntegrationFlow>;
  flow?(flowId: string): Promise<IntegrationFlowState>;
  /** The whole sign-in, where something other than the system browser performs it (the fixture). */
  authorize?(id: string): Promise<IntegrationCatalogue>;
}
