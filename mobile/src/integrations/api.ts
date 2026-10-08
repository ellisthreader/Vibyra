import { apiUrl, requestJson } from '../transport/requestJson';
import type {
  IntegrationCatalogue,
  IntegrationFlow,
  IntegrationFlowState,
  IntegrationsApi,
} from './types';

export class IntegrationsError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
/** A payload that is not a catalogue must not be rendered as an empty shop. */
function validate(value: unknown): IntegrationCatalogue {
  const body = value as IntegrationCatalogue;
  if (!body || !Array.isArray(body.integrations))
    throw new IntegrationsError('Integrations are temporarily unavailable.', 502);
  return {
    enabled: Boolean(body.enabled),
    integrations: body.integrations.filter((integration) => typeof integration?.id === 'string'),
  };
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
export function createIntegrationsApi(
  baseUrl: string,
  token: (prepare?: boolean) => string | null | Promise<string | null>,
  fetcher: typeof fetch = fetch,
): IntegrationsApi {
  // The catalogue is a menu: it answers before sign-in, the same way models do.
  const call = async (
    path: string,
    body?: unknown,
    anonymous = false,
    retried = false,
  ): Promise<any> => {
    const identity = await token(!anonymous);
    if (!identity && !anonymous)
      throw new IntegrationsError(
        'Your guest session could not be started. Please try again.',
        401,
      );
    try {
      const { response: r, data } = await requestJson(
        fetcher,
        apiUrl(baseUrl, `connectors${path}`),
        {
          method: body === undefined ? 'GET' : 'POST',
          headers: {
            ...(identity ? { Authorization: `Bearer ${identity}` } : {}),
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        },
        25000,
      );
      if (identity !== (await token())) {
        // Guest bootstrap may finish during the initial public catalogue request.
        if (anonymous && !retried) return call(path, body, anonymous, true);
        throw new IntegrationsError('Your account changed. Please try again.', 401);
      }
      // A server without this endpoint answers in framework language — "The GET
      // method is not supported for route api/connectors" — and that used to be
      // printed on the page verbatim, because it arrives in the same `message`
      // field our own refusals use. Routing is never something to tell a person.
      // Older deployments reject guests. Do not send them into an unrelated signup flow.
      if (
        (r.status === 403 && data.error === 'Create your free account to use this.') ||
        (r.status === 401 &&
          /^Sign in to Vibyra to connect /i.test(data.error ?? data.message ?? ''))
      ) {
        throw new IntegrationsError(
          'Connecting is temporarily unavailable. Please try again later.',
          r.status,
        );
      }
      // Legacy OAuth setup failures describe deployment internals, not a user action.
      const message = data.error ?? data.message;
      if (
        !r.ok &&
        /\/start$/.test(path) &&
        typeof message === 'string' &&
        /(?:not set up|not configured|not available right now)/i.test(message)
      ) {
        throw new IntegrationsError('Could not connect. Please try again later.', r.status);
      }
      if (!r.ok)
        throw new IntegrationsError(
          missing(r.status)
            ? unexplained(r.status)
            : (data.error ?? data.message ?? unexplained(r.status)),
          r.status,
        );
      return data;
    } catch (error) {
      if (error instanceof IntegrationsError) throw error;
      throw new IntegrationsError(
        'Could not reach Vibyra. Check your connection and try again.',
        0,
      );
    }
  };
  const id = (value: string) => encodeURIComponent(value);
  return {
    catalogue: async () => validate(await call('', undefined, true)),
    connect: async (integration, credential) =>
      validate(await call(`/${id(integration)}/connect`, { credential })),
    disconnect: async (integration) => validate(await call(`/${id(integration)}/disconnect`, {})),
    // Provider access belongs to the existing account or guest, never a new login.
    start: async (integration, returnUrl) =>
      (await call(`/${id(integration)}/start`, { returnUrl })) as IntegrationFlow,
    flow: async (flowId) => {
      const data = await call(`/flows/${id(flowId)}`);
      return {
        status: data.status,
        error: data.error,
        catalogue: validate(data.catalogue),
      } as IntegrationFlowState;
    },
  };
}
