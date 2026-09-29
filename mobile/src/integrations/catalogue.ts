import type { Integration, IntegrationCatalogue } from './types';
import { integration } from './catalogueEntry';
import { collaborationIntegrations } from './catalogueCollaboration';
import { googleTasksIntegrations } from './catalogueGoogleTasks';
import { publicMcpIntegrations } from './cataloguePublicMcp';

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
      'Search and read issues, comments and pull requests',
      'Review PR changes, tests and CI; summarise commits and merged PRs',
      'Open a new issue on a repository',
    ],
    reads:
      'Repositories, source and test files, issue discussions, pull request diffs, reviews, CI status and commits you allow access to.',
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
  integration({
    id: 'gmail',
    name: 'Gmail',
    tagline: 'Email search, reading and sending.',
    blurb: 'Find and read messages in your Gmail account, then send a plain-text email only after you approve its exact contents.',
    category: 'Communication',
    abilities: ['Search up to ten matching emails', 'Read one email and its plain-text body', 'Send one approved plain-text email'],
    reads: 'Your Gmail search results, message headers and plain-text message bodies. Attachments are not read.',
    writes: 'Sends one email to one recipient after you approve its recipient, subject and full body.',
    credential: {
      kind: 'oauth', label: 'Sign in with Google', placeholder: '',
      help: 'Continue to Google to allow Gmail reading and sending. You will return to Vibyra when connected.',
      url: 'https://accounts.google.com/',
    },
  }),
  integration({
    id: 'google_calendar',
    name: 'Google Calendar',
    tagline: 'Upcoming events and approved scheduling.',
    blurb: 'Review your next events and create an event on your primary calendar after approving its exact title and time.',
    category: 'Productivity',
    abilities: ['Read up to twenty upcoming events', 'Create one approved event without inviting attendees'],
    reads: 'Upcoming event titles, times, locations and links on your primary Google Calendar.',
    writes: 'Creates one event on your primary calendar after you approve its title, start, end and description. It does not invite attendees.',
    credential: {
      kind: 'oauth', label: 'Sign in with Google', placeholder: '',
      help: 'Continue to Google to allow Calendar event access. You will return to Vibyra when connected.',
      url: 'https://accounts.google.com/',
    },
  }),
  integration({
    id: 'google_drive',
    name: 'Google Drive',
    tagline: 'Files, Docs, Sheets and Slides.',
    blurb: 'Find files and read bounded text from Google Docs, Sheets, Slides and supported text files.',
    category: 'Productivity',
    abilities: ['Search up to twenty Drive files', 'Read one selected text file or Google document'],
    reads: 'File names, descriptions and bounded text from supported files you can access. Sheets read up to eight tabs per call and can continue with the next tabs.',
    credential: {
      kind: 'oauth', label: 'Sign in with Google', placeholder: '',
      help: 'Continue to Google to allow read access to Drive files. You will return to Vibyra when connected.',
      url: 'https://accounts.google.com/',
    },
  }),
  integration({
    id: 'outlook_mail', name: 'Outlook Mail',
    tagline: 'Microsoft email search, reading and sending.',
    blurb: 'Search and read your Outlook mailbox, then submit a plain-text email after approving its exact contents.',
    category: 'Communication',
    abilities: ['Search up to ten matching messages', 'Read one message', 'Send one approved plain-text email'],
    reads: 'Your Outlook message headers and bounded message bodies. Attachments are not read.',
    writes: 'Submits one email to one recipient after approval. Microsoft confirms acceptance, not delivery.',
    credential: {kind: 'oauth', label: 'Sign in with Microsoft', placeholder: '',
      help: 'Continue to Microsoft to allow mail access. You will return to Vibyra when connected.',
      url: 'https://login.microsoftonline.com/'},
  }),
  integration({
    id: 'outlook_calendar', name: 'Outlook Calendar',
    tagline: 'Upcoming events and approved scheduling.',
    blurb: 'Review upcoming events and create one event on your default Outlook calendar after approval.',
    category: 'Productivity',
    abilities: ['Read up to twenty upcoming events', 'Create one approved event without attendees'],
    reads: 'Event titles, times, locations and links on your default Outlook calendar.',
    writes: 'Creates one event without inviting attendees after you approve the exact title and time.',
    credential: {kind: 'oauth', label: 'Sign in with Microsoft', placeholder: '',
      help: 'Continue to Microsoft to allow calendar access. You will return to Vibyra when connected.',
      url: 'https://login.microsoftonline.com/'},
  }),
  integration({
    id: 'onedrive', name: 'OneDrive',
    tagline: 'Microsoft files and bounded text.',
    blurb: 'Search OneDrive and read supported text files. Office documents and binary files are listed but not opened.',
    category: 'Productivity',
    abilities: ['Search up to twenty files', 'Read one text file up to 1 MB'],
    reads: 'File names and text from supported files in your OneDrive.',
    credential: {kind: 'oauth', label: 'Sign in with Microsoft', placeholder: '',
      help: 'Continue to Microsoft to allow OneDrive read access. You will return to Vibyra when connected.',
      url: 'https://login.microsoftonline.com/'},
  }),
  integration({
    id: 'teams', name: 'Microsoft Teams',
    tagline: 'Workplace chats and messages.',
    blurb: 'List your recent Teams chats and read bounded messages in one chat. Work or school accounts only.',
    category: 'Communication',
    abilities: ['List up to twenty chats', 'Read up to twenty messages in a chat'],
    reads: 'Chats and message text available to your Microsoft work or school account.',
    credential: {kind: 'oauth', label: 'Sign in with Microsoft', placeholder: '',
      help: 'Continue with a Microsoft work or school account to allow Teams chat reading.',
      url: 'https://login.microsoftonline.com/'},
  }),
  integration({
    id: 'sharepoint', name: 'SharePoint',
    tagline: 'Sites and document libraries.',
    blurb: 'Find sites and files, then read bounded text files in a site’s default library. Work or school accounts only.',
    category: 'Productivity',
    abilities: ['Find up to twenty sites', 'Search up to twenty files in a site', 'Read one supported text file'],
    reads: 'Sites and files available to your Microsoft work or school account; only supported text file content is opened.',
    credential: {kind: 'oauth', label: 'Sign in with Microsoft', placeholder: '',
      help: 'Continue with a Microsoft work or school account to allow SharePoint reading.',
      url: 'https://login.microsoftonline.com/'},
  }),
  ...googleTasksIntegrations,
  ...publicMcpIntegrations,
  ...collaborationIntegrations,
];
export const fallbackCatalogue: IntegrationCatalogue = {
  enabled: false,
  integrations: fallbackIntegrations,
};
