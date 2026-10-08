/**
 * Local (stdio) MCP servers on this Mac (roadmap Part 6): the shapes the native commands
 * return, the five starter presets at pinned versions, and the words for what a server will run.
 * Secret values never appear here: `secretEnv` holds variable NAMES, and `secretsSaved` which have a value.
 */
export interface LocalSpec {
  id: string; name: string; command: string; args: string[]; cwd: string | null;
  env: Record<string, string>; secretEnv: string[]; enabled: boolean; timeoutSecs: number | null;
  connectionId: string | null; preset: string | null;
}
export type RunState = 'stopped' | 'starting' | 'running' | 'failed';
export interface RunStatus {
  state: RunState; lastError: string | null; era: 'modern' | 'legacy' | null;
  protocolVersion: string | null; failures: number; startedAtMs: number | null;
}
export interface LocalView { spec: LocalSpec; status: RunStatus; unpinned: boolean; secretsSaved: string[] }

export const emptySpec = (): LocalSpec => ({ id: '', name: '', command: '', args: [], cwd: null, env: {}, secretEnv: [],
  enabled: true, timeoutSecs: null, connectionId: null, preset: null });

export interface PresetField { key: 'folder' | 'file'; label: string; hint: string; placeholder: string }
export interface Preset {
  id: string; name: string; blurb: string; fields: PresetField[];
  /** The definition for the given field values; every launcher is pinned to a version that was run against Vibyra. */
  build: (values: Record<string, string>) => Pick<LocalSpec, 'command' | 'args' | 'cwd' | 'env'>;
}
const folder = (hint: string): PresetField => ({ key: 'folder', label: 'Folder', hint, placeholder: '/Users/you/Projects/site' });

/** Pinned 2026-10-02: each was listed and called against Vibyra's client (`cargo test local_mcp::tests_real -- --ignored`). */
export const PRESETS: Preset[] = [
  { id: 'filesystem', name: 'Files in a folder', blurb: 'Read, search and edit files inside one folder you choose. Nothing outside it.',
    fields: [folder('The only folder this server can reach.')],
    build: v => ({ command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem@2026.8.31', v.folder ?? ''], cwd: v.folder || null, env: {} }) },
  { id: 'git', name: 'Git repository', blurb: 'Status, diffs, history and commits for one repository.',
    fields: [folder('A folder that is a Git repository.')],
    build: v => ({ command: 'uvx', args: ['mcp-server-git==2026.8.18', '--repository', v.folder ?? ''], cwd: v.folder || null, env: {} }) },
  { id: 'fetch', name: 'Fetch web pages', blurb: 'Reads a web page and returns it as text. It can reach any address your Mac can, including your local network.',
    fields: [], build: () => ({ command: 'uvx', args: ['mcp-server-fetch==2026.8.18'], cwd: null, env: {} }) },
  { id: 'memory', name: 'Memory', blurb: 'A small notebook of facts a teammate can add to and search, kept in one file.',
    fields: [{ key: 'file', label: 'Memory file', hint: 'Where it keeps what it remembers.', placeholder: '/Users/you/vibyra-memory.jsonl' }],
    build: v => ({ command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory@2026.8.31'], cwd: null, env: { MEMORY_FILE_PATH: v.file ?? '' } }) },
  { id: 'sqlite', name: 'SQLite database', blurb: 'Run queries against one database file. Changes are writes and ask first.',
    fields: [{ key: 'file', label: 'Database file', hint: 'Created if it does not exist.', placeholder: '/Users/you/data/app.db' }],
    build: v => ({ command: 'uvx', args: ['--with', 'mcp<2', 'mcp-server-sqlite==2025.4.25', '--db-path', v.file ?? ''], cwd: null, env: {} }) },
];

const plain = (word: string) => (/^[A-Za-z0-9_@%+=:,./~-]+$/.test(word) ? word : `"${word.replace(/(["\\$`])/g, '\\$1')}"`);
/** The exact command as it will run, for the consent step and the server row. */
export const commandLine = (s: Pick<LocalSpec, 'command' | 'args'>) => [s.command, ...s.args].map(plain).join(' ');

/** What a preset needs that is still blank. */
export const missingFields = (preset: Preset, values: Record<string, string>) =>
  preset.fields.filter(f => !values[f.key]?.trim()).map(f => f.label);

export interface EnvRow { name: string; value: string; secret: boolean }
/** Rows in the dialog, back to the spec's `env` and `secretEnv` (blank names dropped). */
export function envFromRows(rows: EnvRow[]): Pick<LocalSpec, 'env' | 'secretEnv'> {
  const named = rows.filter(r => r.name.trim());
  return { env: Object.fromEntries(named.filter(r => !r.secret).map(r => [r.name.trim(), r.value])),
    secretEnv: named.filter(r => r.secret).map(r => r.name.trim()) };
}
export const rowsFromEnv = (s: Pick<LocalSpec, 'env' | 'secretEnv'>): EnvRow[] => [
  ...Object.entries(s.env).map(([name, value]) => ({ name, value, secret: false })),
  ...s.secretEnv.map(name => ({ name, value: '', secret: true }))];

/** One short line for how a server is doing, in words; never an error's raw detail. */
export function stateLine(v: LocalView): string {
  if (!v.spec.enabled) return 'Switched off';
  switch (v.status.state) {
    case 'running': return 'Running';
    case 'starting': return 'Starting';
    case 'failed': return 'Stopped after repeated errors';
    default: return 'Starts when a teammate needs it';
  }
}
