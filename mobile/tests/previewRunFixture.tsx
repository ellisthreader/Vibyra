import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeContext, palettes } from '../src/theme';
import { PreviewSessionSheet } from '../src/preview/PreviewSessionSheet';
import { LivePreviewCard } from '../src/preview/LivePreviewCard';
import { useLivePreviewTarget } from '../src/preview/useLivePreviewTarget';
import { ConversationApprovalDock } from '../src/conversation/ConversationApprovalDock';
import { validPreviewRunnable, type PreviewRunnable, type RunApproval, type RunSummary } from '../src/preview/runnable';
import { fixtureWorkspace } from './conversationWorkspaceFixture';
import type { PreviewTarget } from '../src/preview/types';

/** A fake computer for `preview.list`/`run`/`stop`/`open`, counting every call. */
const row = (projectId: string, name: string): PreviewRunnable => ({ projectId, targetId: '.::desktop-rust-dev', name,
  framework: 'tauri', command: 'npm run rust:dev', cwd: name, body: 'tauri dev --config app.json',
  approvalRequired: true, changed: false, commandVersion: '0123456789abcdef', runState: 'idle' });
const model = {
  rows: { one: row('one', 'HKE'), two: row('two', 'Other') } as Record<string, PreviewRunnable>,
  targets: [] as PreviewTarget[], runV1: true,
  /** A message makes `preview.list` fail, as a computer that cannot answer would. */
  error: '',
  /** A message makes `preview.run` fail, as a computer that refuses to run it would. */
  runError: '',
  /** Replies preview.run gives before its default (a queue the check fills). */
  replies: [] as (RunApproval | RunSummary)[],
};
const events = { lists: 0, runs: [] as Record<string, unknown>[], opens: [] as string[], stops: 0, stopped: [] as string[], closes: 0 };
// `chat-one` is a shared chat's id for the folder the computer knows as `one`.
const projects = [{ id: 'one', name: 'One', path: '/tmp/one' }, { id: 'two', name: 'Two', path: '/tmp/two' },
  { id: 'chat-one', name: 'One', path: '/tmp/one' }];
const actions = { ...fixtureWorkspace.actions,
  listPreviews: async () => {
    events.lists++;
    if (model.error) throw new Error(model.error);
    return { targets: model.targets, windowHandoffV1: true, previewRunV1: model.runV1,
      runnable: model.runV1 ? Object.values(model.rows).map(item => ({ ...item })).filter(validPreviewRunnable) : [] };
  },
  runPreview: async (projectId: string, targetId: string, options: { approve?: boolean; commandVersion?: string } = {}) => {
    events.runs.push({ projectId, targetId, ...options });
    if (model.runError) throw new Error(model.runError);
    const reply = model.replies.shift();
    if (reply) return reply;
    const current = model.rows[projectId];
    if (current.approvalRequired && current.commandVersion !== options.commandVersion) {
      const { name, command, cwd, body, changed, commandVersion } = current;
      return { approvalRequired: true as const, name, command, cwd, body, changed, commandVersion, targetId };
    }
    const runId = String(events.runs.length).padStart(32, '0');
    model.rows[projectId] = { ...current, approvalRequired: false, changed: false, runState: 'building', runId,
      logTail: [], error: null, windowGrantId: null, autoOpen: false };
    return { runId, targetId, name: current.name, runState: 'building' as const, stage: null, logTail: [], error: null };
  },
  stopPreview: async (projectId: string) => {
    events.stops++; events.stopped.push(projectId); model.rows[projectId] = { ...model.rows[projectId], runState: 'stopped' }; return { phase: 'stopped' };
  },
  shareWindowPreview: async () => { throw new Error('A run window never needs WindowConsent.'); },
  startPreview: async () => ({ phase: 'running' }),
  openPreview: async (grantId: string) => {
    events.opens.push(grantId);
    return { url: 'http://127.0.0.1:12345/', close: async () => { events.closes++; } };
  },
};
const approval = { id: 'run-app', turnId: 't', kind: 'permission' as const, status: 'pending' as const,
  title: 'Run this app on your computer?', allowLabel: 'Run', choices: ['decline', 'accept'],
  detail: 'npm run rust:dev\ntauri dev --config app.json', scope: 'HKE',
  runApp: { name: 'HKE', command: 'npm run rust:dev', cwd: 'HKE', body: 'tauri dev --config app.json' } };

// `?theme=light` renders the light palette; dark is the default.
const dark = new URLSearchParams(location.search).get('theme') !== 'light';

function Fixture() {
  const [projectId, setProject] = useState('one');
  const [visible, setVisible] = useState(false);
  const [revision, setRevision] = useState(0);
  const [runAvailable, setRunAvailable] = useState(true);
  const [dock, setDock] = useState(false);
  // What the store keeps from a list's `hostPlatform` (see previewActions).
  const [platform, setPlatform] = useState<string | null>(null);
  const changed = () => setRevision(value => value + 1);
  Object.assign(window, { run: { events, model,
    open: () => setVisible(true), close: () => setVisible(false),
    project: (id: string) => setProject(id), dock: () => setDock(true), platform: setPlatform,
    /** Change a row as the computer would, then say `preview.changed`. */
    set: (id: string, patch: Partial<PreviewRunnable>) => { model.rows[id] = { ...model.rows[id], ...patch }; changed(); },
    targets: (targets: PreviewTarget[]) => { model.targets = targets; changed(); },
    changed,
    oldComputer: () => { model.runV1 = false; setRunAvailable(false); changed(); },
  } });
  const workspace = { ...fixtureWorkspace, status: 'connected' as const, previewAvailable: true,
    previewRunAvailable: runAvailable, previewRevision: revision, projects, actions,
    previewHost: platform ? { hostId: fixtureWorkspace.host!.id, platform } : null };
  // As in WorkspaceApp: the header's own find is handed to the sheet.
  const known = useLivePreviewTarget(workspace, projectId);
  return <ThemeContext.Provider value={{ colors: dark ? palettes.dark : palettes.light, dark }}>
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <LivePreviewCard workspace={workspace} projectId={projectId} onPress={() => setVisible(true)} />
        {dock && <ConversationApprovalDock item={approval} canRespond onDecision={async () => {}} />}
      </div>
      <PreviewSessionSheet key={projectId} visible={visible} onClose={() => setVisible(false)} projectId={projectId}
        workspace={workspace} known={known} />
    </SafeAreaProvider>
  </ThemeContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
