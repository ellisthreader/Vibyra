import { LaunchModelPicker, type LaunchableModel } from '../src/components/rail/LaunchModelPicker';
import '../src/styles/launch-model-picker.css';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { mockIPC } from '@tauri-apps/api/mocks';
import { TitleBar } from '../src/components/layout/TitleBar';
import { ProjectStrip } from '../src/components/layout/ProjectStrip';
import { NewProjectPage } from '../src/components/home/NewProjectPage';
import { LaunchEffortPicker } from '../src/components/rail/LaunchEffortPicker';
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
const requests: { command: string; args: any }[] = [];
let failSave = false;
Object.assign(window, { requests, failNextSave: () => { failSave = true; } });
if (location.search.includes('light')) document.documentElement.dataset.theme = 'light';
useProjectStore.setState({ homeDir: '/Users/fixture', activeId: 'original', view: 'project' });
useSettingsStore.setState({ settings: { projects: [{ id: 'original', name: 'Original', root: '/fixture/original' }] } as any });
mockIPC(async (command, args: any) => {
  requests.push({ command, args });
  if (command === 'save_settings' && failSave) { failSave = false; throw new Error('Save failed'); }
  if (command === 'fs_create_project_folder') return `${args.parent}/${args.name}`;
  if (command === 'plugin:dialog|open') return '/Users/fixture/Projects';
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
  return <div className="app" style={{ height: '100vh' }}><TitleBar /><div className="shell"><div className="product-code-shell">
    <ProjectStrip />{view === 'new-project' ? <NewProjectPage /> : <main className="terminal-stage" style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
      <div className="grid-empty launch-stage">
      <p data-testid="active-project">{active}</p><section className="launch-card"><header className="launch-card__head"><h2>New terminal</h2></header>
        {location.search.includes('models') && <LaunchModelPicker models={models} selected={models[modelIndex]} loading={false} open={modelOpen}
          onOpenChange={setModelOpen} onSelect={id => { setModelIndex(models.findIndex(m => m.model.id === id)); setModelOpen(false); }}
          onBrowseAll={() => setModelOpen(false)} onConnectAccounts={() => {}} />}
        <LaunchEffortPicker options={values.map(value => ({ value, label: value === 'xhigh' ? 'Extra high' : value[0].toUpperCase() + value.slice(1), hint: 'More time for complex tasks, with deeper reasoning.' }))}
          value={effort} onChange={setEffort} /></section></div></main>}
  </div></div></div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
