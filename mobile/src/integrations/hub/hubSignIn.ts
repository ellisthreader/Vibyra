import { authorizeInBrowser } from '../authorizeInBrowser';
import type { IntegrationsApi } from '../types';
import type { ConnectionsApi, SignIn } from '../../agents/v2/connectionsModel';

const NO_SIGN_IN = 'hub/no-sign-in';
const unsupported = async (): Promise<never> => { throw new Error('Not used by the connections hub.'); };

/**
 * An Agent v2 sign-in (add account, reconnect, MCP server) in the same system sheet ordinary
 * integrations use — `authorizeInBrowser`, never an in-app web page. `begin` makes the server
 * flow with the sheet's return link; an MCP server that needs no sign-in answers null.
 */
export async function hubSignIn(
  connections: ConnectionsApi,
  begin: (returnUrl: string) => Promise<SignIn | null>,
  signal?: AbortSignal,
): Promise<'connected' | 'no-sign-in'> {
  const adapter: IntegrationsApi = {
    catalogue: unsupported, connect: unsupported, disconnect: unsupported,
    start: async (_id, returnUrl) => {
      const signIn = await begin(returnUrl);
      if (!signIn) throw new Error(NO_SIGN_IN);
      return signIn;
    },
    flow: async flowId => {
      const state = await connections.flow(flowId);
      return { status: state.status, error: state.error ?? undefined, catalogue: { enabled: true, integrations: [] } };
    },
  };
  try {
    await authorizeInBrowser(adapter, 'agent-connection', signal);
    return 'connected';
  } catch (error) {
    if (error instanceof Error && error.message === NO_SIGN_IN) return 'no-sign-in';
    throw error;
  }
}
