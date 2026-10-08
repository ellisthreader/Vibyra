import { LaunchModelPicker, type LaunchableModel } from '../src/components/rail/LaunchModelPicker';
import '../src/styles/launch-model-picker.css';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { mockIPC } from '@tauri-apps/api/mocks';
import { TitleBar } from '../src/components/layout/TitleBar';
import { ProjectStrip } from '../src/components/layout/ProjectStrip';
import { NewProjectPage } from '../src/components/home/NewProjectPage';
import { LaunchEffortPicker } from '../src/components/rail/LaunchEffortPicker';
import { useAccountStore } from '../src/state/accountStore';
import { useProjectStore } from '../src/state/projectStore';
import { useSettingsStore } from '../src/state/settingsStore';
import type { LaunchEffort } from '../src/state/launchSettingsStore';
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import '../src/styles/controls.css';
import '../src/styles/chrome.css';
import '../src/styles/chrome.part-02.css';
import '../src/styles/workspace.css';
import '../src/styles/strip.css';
import '../src/styles/project-focus.css';
import '../src/styles/launch-settings.css';
// The setup step reuses Settings rows, whose styles main.tsx loads with the
// rest of the app; without this the fixture would judge an unstyled page.
import '../src/styles/modals.part-02.css';
const requests: { command: string; args: any }[] = [];
let failSave = false;
let failBuild = false;
Object.assign(window, { requests, failNextSave: () => { failSave = true; }, failNextBuild: () => { failBuild = true; } });
if (location.search.includes('light')) document.documentElement.dataset.theme = 'light';
useProjectStore.setState({ homeDir: '/Users/fixture', activeId: 'original', view: 'project' });
useAccountStore.setState({ snapshot: { profile: { email: 'owner@fixture.test' } } } as any);
useSettingsStore.setState({ settings: { projects: [{ id: 'original', name: 'Original', root: '/fixture/original' }] } as any });
mockIPC(async (command, args: any) => {
  requests.push({ command, args });
  if (command === 'save_settings' && failSave) { failSave = false; throw new Error('Save failed'); }
  if (command === 'plugin:dialog|open') return '/Users/fixture/Projects';
  // Flutter and Rails are absent on purpose: a row whose toolchain is missing
  // has to stay readable and unpickable rather than quietly vanish.
  if (command === 'scaffold_preflight') return Object.fromEntries(
    (args.tools as string[]).map(tool => [tool, !['flutter', 'rails'].includes(tool)]));
  if (command === 'scaffold_free_name') return args.base;
  if (command === 'scaffold_cancel') return null;
  if (command === 'teammate_request' && args.path === 'connectors') {
    return { enabled: true, integrations: [{ id: 'github', name: 'GitHub', installed: location.search.includes('github'),
      account: '@octocat', reads: null, writes: null, credential: { configured: true } }] };
  }
  if (command === 'teammate_request' && args.path === 'connectors/github/repositories') {
    return { fullName: `octocat/${args.body.name}`, htmlUrl: `https://github.com/octocat/${args.body.name}`,
      cloneUrl: `https://github.com/octocat/${args.body.name}.git`, defaultBranch: 'main' };
  }
  if (command === 'github_publish') {
    ['Preparing the repository', 'Staging the project', 'Making the first commit',
      'Naming the branch', 'Adding the GitHub remote', 'Pushing to GitHub'].forEach((label, index) => {
      args.onEvent.onmessage({ type: 'step', index, total: 6, label });
    });
    return { ok: true, message: null, stalled: false };
  }
  if (command === 'scaffold_run') {
    const steps = args.plan.steps as { label: string }[];
    steps.forEach((step, index) => {
      args.onEvent.onmessage({ type: 'step', index, total: steps.length, label: step.label });
      args.onEvent.onmessage({ type: 'line', data: `${step.label.toLowerCase()}…` });
    });
    if (failBuild) { failBuild = false; return { ok: false, message: 'Creating the app stopped with exit code 1.', stalled: false }; }
    return { ok: true, message: null, stalled: false };
  }
  return null;
});
const values: LaunchEffort[] = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
const models = Array.from({ length: 36 }, (_, i) => ({ model: { id: `fixture-${i}`, label: `Model ${String(i + 1).padStart(2, '0')}` },
  group: { company: i < 18 ? 'OpenAI' : 'Anthropic', providerKey: i < 18 ? 'openai' : 'anthropic', accent: '#888' }, plan: { runner: { name: 'Fixture CLI' } } })) as LaunchableModel[];
function Fixture() {
  const [modelIndex, setModelIndex] = useState(0);
  const [modelOpen, setModelOpen] = useState(false);
  const view = useProjectStore(s => s.view);
  const active = useProjectStore(s => s.activeId);
  const [effort, setEffort] = useState<LaunchEffort>('high');
  const provider = location.search.includes('claude') ? 'claude' : location.search.includes('codex') ? 'codex' : undefined;
  const efforts: LaunchEffort[] = provider === 'claude' ? [...values.slice(0, -1), 'ultracode'] : values;
  return <div className="app" style={{ height: '100vh' }}><TitleBar /><div className="shell"><div className="product-code-shell">
    <ProjectStrip />{view === 'new-project' ? <NewProjectPage /> : <main className="terminal-stage" style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
      <div className="grid-empty launch-stage">
      <p data-testid="active-project">{active}</p><section className="launch-card"><header className="launch-card__head"><h2>New terminal</h2></header>
        {location.search.includes('models') && <LaunchModelPicker models={models} selected={models[modelIndex]} loading={false} open={modelOpen}
          onOpenChange={setModelOpen} onSelect={id => { setModelIndex(models.findIndex(m => m.model.id === id)); setModelOpen(false); }}
          onBrowseAll={() => setModelOpen(false)} onConnectAccounts={() => {}} />}
        <LaunchEffortPicker provider={provider}
          options={efforts.map(value => ({ value, label: value === 'xhigh' ? 'Extra high' : value[0].toUpperCase() + value.slice(1), hint: 'More time for complex tasks, with deeper reasoning.' }))}
          value={effort} onChange={setEffort} /></section></div></main>}
  </div></div></div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
