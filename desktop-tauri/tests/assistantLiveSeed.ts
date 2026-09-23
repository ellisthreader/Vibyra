// What the live-assistant fixture's workspace holds: the situation from the
// transcript that started this — a Claude terminal busy in PortfolioWebsite,
// a Codex conversation beside it — plus enough around it (a dev server, a
// finished shell, a second project waiting on a permission prompt) that
// "which one" is a real question.

const E = '\x1b';
const color = (text: string, rgb = '215;119;87') => `${E}[38;2;${rgb}m${text}${E}[39m`;

/** Raw PTY bytes, the way the ring buffer holds them: colours, cursor moves,
 * a title sequence and a redrawn status line. Reading them naively is how the
 * assistant once described a busy agent as "guiding you through the workspace". */
export const SCREENS: Record<number, string> = {
  1: [
    `${E}]0;✳ Dark mode toggle${E}\\${E}[?25l`,
    color('╭───────────────────────────────────────────────╮'),
    `${color('│')} ✻ Welcome to ${E}[1mClaude Code${E}[22m                       ${color('│')}`,
    `${color('│')}   cwd: /Users/ellis/Desktop/PortfolioWebsite   ${color('│')}`,
    color('╰───────────────────────────────────────────────╯'),
    '',
    `${E}[2m> ${E}[22mAdd a dark mode toggle to the navbar and persist the choice in localStorage`,
    '',
    `${color('⏺')} I'll add a dark mode toggle. Let me look at the navbar first.`,
    `${color('⏺')} ${E}[1mRead${E}[22m(src/components/Navbar.tsx)`,
    '  ⎿  Read 84 lines',
    `${color('⏺')} ${E}[1mUpdate${E}[22m(src/components/Navbar.tsx)`,
    `  ⎿  Updated src/components/Navbar.tsx with 23 additions and 2 removals`,
    `${color('⏺')} ${E}[1mWrite${E}[22m(src/hooks/useTheme.ts)`,
    '  ⎿  Wrote 31 lines to src/hooks/useTheme.ts',
    `${color('⏺')} ${E}[1mBash${E}[22m(npm run lint)`,
    '  ⎿  Running…',
    '',
    `${E}[2K${E}[1A${E}[2K${E}[G${color('✽')} Linting the navbar changes… ${E}[2m(esc to interrupt · 41s · ↓ 1.2k tokens)${E}[22m`,
    `${E}[2K${E}[G${color('✢')} Linting the navbar changes… ${E}[2m(esc to interrupt · 42s · ↓ 1.3k tokens)${E}[22m`,
    '',
    `${E}[2m╭─────────────────────────────────────────────────╮${E}[22m`,
    `${E}[2m│${E}[22m >                                               ${E}[2m│${E}[22m`,
    `${E}[2m╰─────────────────────────────────────────────────╯${E}[22m`,
    `  ${E}[2m⏵⏵ accept edits on · Claude Fable 5.1${E}[22m`,
  ].join('\r\n'),
  2: [
    '\x1b[32mellis@mac\x1b[0m PortfolioWebsite % npm run dev',
    '',
    '> portfolio@0.1.0 dev',
    '> next dev --turbopack',
    '',
    '   ▲ Next.js 15.3.1 (Turbopack)',
    '   - Local:        http://localhost:3000',
    ' ✓ Ready in 812ms',
    ' ○ Compiling / ...',
    ' ✓ Compiled / in 1.4s',
    ' GET / 200 in 1532ms',
  ].join('\r\n'),
  3: 'ellis@mac PortfolioWebsite % npm test\r\n\r\nTests: 2 failed, 31 passed, 33 total\r\nellis@mac PortfolioWebsite % exit\r\n',
  4: [
    `${color('⏺')} ${E}[1mBash${E}[22m(npm install sharp)`,
    '',
    ` ${E}[1mDo you want to proceed?${E}[22m`,
    ' ❯ 1. Yes',
    "   2. Yes, and don't ask again for npm install commands",
    '   3. No, and tell Claude what to do differently (esc)',
  ].join('\r\n'),
};

const base = { permissionMode: 'standard', reasoningEffort: null, sourceCwd: null, workspaceMode: 'shared',
  safeSnapshotFingerprint: null, customTitle: null, osc: null, exitCode: null, visibility: 'visible',
  lastFocusedAt: 0, agentSessionId: null, accountId: null } as const;

export function seedPanes(): any[] {
  return [
    { ...base, id: 1, projectId: 'portfolio', agentId: 'claude', title: 'Claude Code', model: 'anthropic/claude-fable-5.1', status: 'running', accent: '#d97757', osc: 'Dark mode toggle', reasoningEffort: 'high' },
    { ...base, id: 2, projectId: 'portfolio', agentId: 'shell', title: 'Terminal', model: null, status: 'running', accent: '#94a3b8' },
    { ...base, id: 3, projectId: 'portfolio', agentId: 'shell', title: 'Terminal', model: null, status: 'exited', exitCode: 0, accent: '#94a3b8' },
    { ...base, id: 4, projectId: 'hke', agentId: 'claude', title: 'Claude Code', model: 'anthropic/claude-sonnet-5', status: 'running', accent: '#d97757', visibility: 'hidden' },
  ];
}

/** Codex conversations are named by the engine's UUIDs, as in the app. */
const CODEX_ID = '3f9c2a71-5b8e-4d20-9a6f-1c2b3d4e5f60';

export function seedSessions(): any[] {
  return [{ id: CODEX_ID, projectId: 'portfolio', title: 'Codex', status: 'running', accountId: 'default', kind: 'codex' }];
}

/** The Codex conversation's transcript, as `conversation.snapshot` returns it. */
export const CHAT_ITEMS: Record<string, any[]> = {
  [CODEX_ID]: [
    { id: 'u1', turnId: 't1', kind: 'message', role: 'user', text: 'The contact form tests are failing, fix them', status: 'completed' },
    { id: 'a1', turnId: 't1', kind: 'activity', title: 'Ran npm test -- ContactForm', command: 'npm test -- ContactForm', status: 'completed', exitCode: 1 },
    { id: 'a2', turnId: 't1', kind: 'message', role: 'assistant', text: 'Two tests fail because the email validator rejects plus-addresses. I am updating src/lib/validateEmail.ts and re-running the suite.', status: 'completed' },
    { id: 'a3', turnId: 't1', kind: 'activity', title: 'Editing src/lib/validateEmail.ts', status: 'running' },
  ],
};
