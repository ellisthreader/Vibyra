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
/**
 * `enabled` is the server's own switch. The list is readable either way.
 * `sample` marks the sample workspace's shipped copy: it is off because there is
 * no account to connect to, not because the server said so, and the page has to
 * tell those apart or a signed-in person is told to wait for a switch that is on.
 */
export interface IntegrationCatalogue { enabled: boolean; integrations: Integration[]; sample?: boolean }
export interface IntegrationsApi {
  catalogue(): Promise<IntegrationCatalogue>;
  connect(id: string, credential: string): Promise<IntegrationCatalogue>;
  disconnect(id: string): Promise<IntegrationCatalogue>;
}
