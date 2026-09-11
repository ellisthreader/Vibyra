/** What a person pastes to connect an integration, and where to get it. */
export interface IntegrationCredential { label: string; placeholder: string; help: string; url: string }
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
export interface IntegrationsApi {
  catalogue(): Promise<IntegrationCatalogue>;
  connect(id: string, credential: string): Promise<IntegrationCatalogue>;
  disconnect(id: string): Promise<IntegrationCatalogue>;
}
