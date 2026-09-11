import type { Integration, IntegrationCatalogue } from './types';

/**
 * What ships in the app, so the page draws the moment it opens and still says
 * something true with no network. The server's own catalogue replaces all of it
 * as soon as one answers; only the server knows what an account has connected,
 * so everything here is uninstalled by definition.
 *
 * Entries are written out by name rather than positionally: several of them with an
 * optional `writes` in the middle is exactly the shape where the wrong argument
 * lands in the wrong field and the page still compiles.
 *
 * Keep in step with `backend/config/integrations.php`, in the same order.
 */
type Entry = Omit<Integration, 'mention' | 'writes' | 'installed' | 'account' | 'connectedAt'> & { writes?: string };
const integration = (entry: Entry): Integration => ({
  ...entry, mention: '@' + entry.id, writes: entry.writes ?? null,
  installed: false, account: null, connectedAt: null,
});
export const fallbackIntegrations: Integration[] = [
  integration({
    id: 'github', name: 'GitHub', tagline: 'Repositories, issues and pull requests.',
    blurb: 'Ask about your repositories, search issues and pull requests, read recent commits, and open an issue without leaving the chat.',
    category: 'Development',
    abilities: ['List the repositories your token can see', 'Search issues and pull requests',
      'Read the most recent commits on a branch', 'Open a new issue on a repository'],
    reads: 'Repository names, issues, pull requests and commit messages your token can already read.',
    writes: 'Opens issues you ask for. It never closes, edits or comments on one, and it touches no code, branch or pull request.',
    credential: { label: 'Personal access token', placeholder: 'github_pat_…',
      help: 'Create a fine-grained token, choose the repositories it can see, and give it read access to Contents, Issues and Pull requests. Set Issues to read and write if you want to open issues from a chat. One token reaches one owner: your own account or one organization.',
      url: 'https://github.com/settings/personal-access-tokens/new' },
  }),
  integration({
    id: 'stripe', name: 'Stripe', tagline: 'Payments, balance and customers.',
    blurb: 'Ask what came in today, look up a customer by email, read your balance, and add a customer without opening the dashboard.',
    category: 'Payments',
    abilities: ['Read your available and pending balance', 'List recent payments', 'Find a customer by email address',
      'Create a customer record, which moves no money'],
    reads: 'Your balance, recent charges and customer records.',
    writes: 'Creates customer records you ask for. It cannot charge, refund, pay out, or start a subscription, and it will not make a second customer for an email that already has one.',
    credential: { label: 'Restricted API key', placeholder: 'rk_live_…',
      help: 'Create a restricted key with read access to Balance and Charges, and write access to Customers. A full secret key is not needed.',
      url: 'https://dashboard.stripe.com/apikeys' },
  }),
];
export const fallbackCatalogue: IntegrationCatalogue = { enabled: false, integrations: fallbackIntegrations };
