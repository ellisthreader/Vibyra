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
 * Keep in step with `backend/config/chat_connectors.php`, in the same order.
 */
type Entry = Omit<Integration, 'mention' | 'writes' | 'installed' | 'account' | 'connectedAt'> & {
  writes?: string;
};
const integration = (entry: Entry): Integration => ({
  ...entry,
  mention: '@' + entry.id,
  writes: entry.writes ?? null,
  installed: false,
  account: null,
  connectedAt: null,
});
export const fallbackIntegrations: Integration[] = [
  integration({
    id: 'github',
    name: 'GitHub',
    tagline: 'Repositories, issues and pull requests.',
    blurb:
      'Review pull requests, inspect code and tests, turn recent commits and merged work into updates, and open issues from chat.',
    category: 'Development',
    abilities: [
      'List the repositories you allow access to',
      'Search issues and pull requests',
      'Review PR changes, tests and CI; summarise commits and merged PRs',
      'Open a new issue on a repository',
    ],
    reads:
      'Repositories, source and test files, pull request diffs, reviews, CI status, issues and commits you allow access to.',
    writes:
      'Opens issues you ask for. It never closes, edits or comments on one, and it touches no code, branch or pull request.',
    credential: {
      kind: 'oauth',
      label: 'Sign in with GitHub',
      placeholder: '',
      help: 'Continue to GitHub to sign in and approve access. You will return to Vibyra when it is connected.',
      url: 'https://github.com/login',
    },
  }),
  integration({
    id: 'stripe',
    name: 'Stripe',
    tagline: 'Payments, balance and customers.',
    blurb:
      'Ask how much your project collected this month, see refunds and balances, and look up customers. Test payments are clearly labelled.',
    category: 'Payments',
    abilities: [
      'Read your available and pending balance',
      'Report monthly payments and refunds by project',
      'Find a customer by email address',
      'Create a customer record, which moves no money',
    ],
    reads:
      'Your account, project payment tags, dated payments and refunds, balance and customer records.',
    writes:
      'Creates customer records you ask for. It cannot charge, refund, pay out, or start a subscription, and it will not make a second customer for an email that already has one.',
    credential: {
      kind: 'oauth',
      label: 'Sign in with Stripe',
      placeholder: '',
      help: 'Continue to Stripe to sign in and approve access. You will return to Vibyra when it is connected.',
      url: 'https://dashboard.stripe.com/login',
    },
  }),
  integration({
    id: 'figma',
    name: 'Figma',
    tagline: 'Frames, layers and comments.',
    blurb:
      'Ask what a screen actually says - spacing, colour, copy, the state you forgot - and read the comments left on a file.',
    category: 'Design',
    abilities: [
      'List the pages and top-level frames in a file you name',
      'Read one frame or node in full: bounds, text and fill colours',
      'Read the comment threads left on a file',
    ],
    reads:
      'Pages, frames and layers - names, bounds, text and fill colours - and comments, in a file you name or link.',
    credential: {
      kind: 'oauth',
      label: 'Sign in with Figma',
      placeholder: '',
      help: 'Continue to Figma to sign in and approve access. You will return to Vibyra when it is connected.',
      url: 'https://www.figma.com/login',
    },
  }),
];
export const fallbackCatalogue: IntegrationCatalogue = {
  enabled: false,
  integrations: fallbackIntegrations,
};
