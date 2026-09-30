import type { Project, RailwayStatus, WorkspaceModel } from '../ui/types';
import type { Integration } from './types';

/**
 * The integrations that are not accounts on a server but things on the person's
 * own computer, built from what that computer reports rather than from
 * `/api/connectors`. They sit on the same page as GitHub, Stripe and Figma and
 * are drawn by the same row, because to the person "what can my chat reach" is
 * one question. What differs is the card: there is nothing to sign in to, so
 * "connect" means setting it up on the Mac, and "installed" means the Mac says
 * it is there.
 *
 * Kept out of `IntegrationsProvider`: chatReferences adds device suggestions
 * separately and requires the exact project binding before a referenced send.
 * Device IDs never enter the server connector list.
 */
export type DeviceWorkspace = Pick<WorkspaceModel, 'status' | 'host' | 'projects' | 'railway'>;

/** The vault the Mac shares, if it shares one. `kind` is what a current Mac sends; `filesAvailable` alone is an older one. */
export function vaultProject(workspace: DeviceWorkspace): Project | null {
  if (workspace.status !== 'connected') return null;
  return (
    workspace.projects.find((project) => project.kind === 'vault') ??
    workspace.projects.find((project) => project.filesAvailable === true && !project.kind) ??
    null
  );
}

export function railwayProject(workspace: DeviceWorkspace): Project | null {
  return workspace.status === 'connected' && workspace.railway?.status === 'ready'
    ? (workspace.projects.find((project) => project.kind === 'railway') ?? null)
    : null;
}

const entry = (fields: Omit<Integration, 'mention' | 'connectedAt'>): Integration => ({
  ...fields,
  mention: '@' + fields.id,
  connectedAt: null,
});

export function obsidianIntegration(workspace: DeviceWorkspace): Integration {
  const vault = vaultProject(workspace);
  return entry({
    id: 'obsidian',
    name: 'Obsidian',
    tagline: 'Your notes, searched from a chat.',
    blurb:
      "Ask what you decided, find the note that mentions something, and read today's log - out of the vault on your Mac, without opening it.",
    category: 'Notes',
    abilities: [
      'List the folders and notes in your vault',
      'Search every note for a phrase',
      'Read one note in full and quote from it',
    ],
    reads:
      'The notes inside the one folder you choose on your Mac. Every read is approved on this phone first; approved results are sent to the AI provider to answer your question. .git, .env and node_modules are refused.',
    writes: null,
    credential: {
      kind: 'device',
      label: 'Choose a vault on your Mac',
      placeholder: '',
      help: 'On your Mac, open Vibyra, then Settings, iPhone connection, Vault folder, and choose your Obsidian vault. Any folder of Markdown works.',
      url: '',
    },
    installed: vault !== null,
    account: vault?.name ?? null,
  });
}

/**
 * What to do about Railway on the Mac. Saying nothing is not the same as saying
 * no: a Mac that has not answered - one on an older Vibyra, or one asked a moment
 * ago - must not be told to install a CLI it may already have.
 */
function railwayHelp(railway: RailwayStatus | null): string {
  if (!railway)
    return 'Your Mac has not said whether it has the Railway CLI. Make sure Vibyra on your Mac is up to date, then check again.';
  if (railway.status === 'ready')
    return 'Update Vibyra on your Mac to enable Railway chat tools, then check again.';
  if (railway.status === 'signedOut')
    return 'The Railway CLI on your Mac is signed out. In a terminal on your Mac, run: railway login';
  return 'Install the Railway CLI on your Mac and sign in to it: in a terminal, run npm install -g @railway/cli, then railway login.';
}

export function railwayIntegration(workspace: DeviceWorkspace): Integration {
  const railway: RailwayStatus | null =
    workspace.status === 'connected' ? (workspace.railway ?? null) : null;
  return entry({
    id: 'railway',
    name: 'Railway',
    tagline: 'Deploys and logs, through your Mac.',
    blurb:
      'Ask what the last deploy did, whether it is still building, and what the logs said - answered by the Railway CLI already signed in on your Mac, so no token is ever kept in this app.',
    category: 'Hosting',
    abilities: [
      'List your Railway projects and services',
      'Read the latest deployments and their status',
      'Read a short, redacted tail of a deploy log',
    ],
    reads:
      'Project, service and deployment names and states, and up to 40 log lines with best-effort secret redaction. Logs can still contain sensitive application data; approve only what you want sent to the AI. Variables are never read, and nothing is deployed, restarted or changed.',
    writes: null,
    credential: {
      kind: 'device',
      label: 'Sign in to Railway on your Mac',
      placeholder: '',
      help: railwayHelp(railway),
      url: 'https://docs.railway.com/guides/cli',
    },
    installed: railwayProject(workspace) !== null,
    account: railway?.status === 'ready' ? railway.account : null,
  });
}

/** Both entries, in the order they sit under the server's own. */
export function deviceIntegrations(workspace: DeviceWorkspace): Integration[] {
  return [obsidianIntegration(workspace), railwayIntegration(workspace)];
}

/**
 * The one line a connected integration shows, in the row and on its card alike. An
 * account is someone you are signed in as; a vault is a folder you are connected to,
 * and "Connected as Notes" reads like a username the person never chose.
 */
export function connectedDetail(entry: Integration): string {
  if (!entry.account) return 'Connected';
  return entry.id === 'obsidian'
    ? `Connected to ${entry.account}`
    : `Connected as ${entry.account}`;
}

/** Why a device integration is not usable right now, for its card; null when it is. */
export function deviceBlock(entry: Integration, workspace: DeviceWorkspace): string | null {
  if (entry.installed) return null;
  if (workspace.status !== 'connected')
    return 'Connect your computer first. This works through the Mac you pair with Vibyra.';
  return entry.credential.help;
}
