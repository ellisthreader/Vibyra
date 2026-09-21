import { LaunchModelPicker, type LaunchableModel } from '../src/components/rail/LaunchModelPicker';
import '../src/styles/launch-model-picker.css';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LaunchEffortPicker } from '../src/components/rail/LaunchEffortPicker';
import { LaunchApprovalModal } from '../src/components/rail/LaunchApprovalModal';
import { useLaunchApprovalStore } from '../src/state/launchApprovalStore';
import type { LaunchEffort } from '../src/state/launchSettingsStore';
import '../src/styles/tokens.css';
import '../src/styles/base.css';
import '../src/styles/controls.css';
import '../src/styles/modals.css';
import '../src/styles/launch-settings.css';
import '../src/styles/launch-approval.css';
if (location.search.includes('light')) document.documentElement.dataset.theme = 'light';
const claude = location.search.includes('claude');
const values: LaunchEffort[] = ['low', 'medium', 'high', 'xhigh', 'max', claude ? 'ultracode' : 'ultra'];
let launches = 0;
Object.assign(window, { launchCount: () => launches, openApproval: (count = 3, fail = false) => useLaunchApprovalStore.getState().request({ projectName: 'Vibyra', changedFiles: 1702, workerCount: count, continueLaunch: async () => { launches++; await new Promise(r => setTimeout(r, 700)); if (fail) throw new Error('Could not prepare the workspace.'); } }) });
const models = Array.from({ length: 32 }, (_, i) => ({ model: { id: `model-${i}`, label: `Model ${i + 1}` }, group: { company: 'OpenAI', providerKey: 'openai', accent: '#888' }, plan: { runner: { name: 'Codex' } } })) as LaunchableModel[];
function Fixture() {
  const [model, setModel] = useState(models[0]);
  const [open, setOpen] = useState(false);
  const [effort, setEffort] = useState<LaunchEffort>('high');
  return <main className="terminal-stage" style={{ padding: 32, height: '100vh', overflow: 'auto' }}><section className="launch-card" style={{ margin: '80px auto', zIndex: 1 }}>
    <header className="launch-card__head"><h2>New terminal</h2><p>{claude ? 'Claude Code' : 'Codex'}</p></header>
    <LaunchModelPicker models={models} selected={model} loading={false} open={open} onOpenChange={setOpen}
      onSelect={id => { setModel(models.find(m => m.model.id === id)!); setOpen(false); }} onBrowseAll={() => setOpen(false)} onConnectAccounts={() => {}} />
    <LaunchEffortPicker provider={claude ? 'claude' : 'codex'} options={values.map(value => ({ value,
      label: value === 'ultracode' ? 'Ultra code' : value[0].toUpperCase() + value.slice(1), hint: value === 'ultra' ? '' : 'More time for complex tasks.' }))}
      value={effort} onChange={setEffort} />
    </section><LaunchApprovalModal /></main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
