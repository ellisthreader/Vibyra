import type { IntegrationCatalogue, IntegrationsApi } from './types';

export class IntegrationsError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
/** A payload that is not a catalogue must not be rendered as an empty shop. */
function validate(value: unknown): IntegrationCatalogue {
  const body = value as IntegrationCatalogue;
  if (!body || !Array.isArray(body.integrations)) throw new IntegrationsError('Integrations are temporarily unavailable.', 502);
  return { enabled: Boolean(body.enabled), integrations: body.integrations.filter(integration => typeof integration?.id === 'string') };
}
/**
 * The body, whatever the server actually sent. A failure does not always arrive
 * as JSON — a proxy error page and a gateway timeout are both HTML — and parsing
 * before the status was read threw, so every one of them was reported as if the
 * phone had never heard back at all.
 */
async function parse(r: Response): Promise<any> {
  const text = await r.text().catch(() => '');
  try { const value: unknown = text ? JSON.parse(text) : null; return value && typeof value === 'object' ? value : {}; }
  catch { return {}; }
}
/** The statuses that mean "this deployment has no integrations", not "your request was wrong". */
const missing = (status: number) => status === 404 || status === 405 || status === 501;

/** What to say when the server answered but its body explained nothing usable. */
function unexplained(status: number): string {
  if (missing(status)) return 'Integrations are not available on this server yet.';
  if (status === 429) return 'That was a lot at once. Please try again in a moment.';
  if (status >= 500) return 'Vibyra could not answer just now. Please try again.';
  return 'Integrations are temporarily unavailable.';
}
export function createIntegrationsApi(baseUrl: string, token: () => string | null, fetcher: typeof fetch = fetch): IntegrationsApi {
  // The catalogue is a menu: it answers before sign-in, the same way models do.
  const call = async (path: string, body?: unknown, anonymous = false) => {
    const identity = token();
    if (!identity && !anonymous) throw new IntegrationsError('Sign in to connect an integration.', 401);
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const r = await fetcher(`${baseUrl.replace(/\/$/, '')}/api/integrations${path}`, { method: body === undefined ? 'GET' : 'POST',
        headers: { ...(identity ? { Authorization: `Bearer ${identity}` } : {}), Accept: 'application/json', 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
      const data = await parse(r);
      if (!anonymous && identity !== token()) throw new IntegrationsError('Your account changed. Please try again.', 401);
      // A server without this endpoint answers in framework language — "The GET
      // method is not supported for route api/integrations" — and that used to be
      // printed on the page verbatim, because it arrives in the same `message`
      // field our own refusals use. Routing is never something to tell a person.
      if (!r.ok) throw new IntegrationsError(missing(r.status) ? unexplained(r.status)
        : data.error ?? data.message ?? unexplained(r.status), r.status);
      return data;
    } catch (error) {
      if (error instanceof IntegrationsError) throw error;
      throw new IntegrationsError('Could not reach Vibyra. Check your connection and try again.', 0);
    } finally { clearTimeout(timeout); }
  };
  const id = (value: string) => encodeURIComponent(value);
  return {
    catalogue: async () => validate(await call('', undefined, true)),
    connect: async (integration, credential) => validate(await call(`/${id(integration)}/connect`, { credential })),
    disconnect: async integration => validate(await call(`/${id(integration)}/disconnect`, {})),
  };
}
