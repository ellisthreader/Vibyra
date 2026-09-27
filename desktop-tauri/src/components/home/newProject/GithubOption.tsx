import { useEffect, useState } from 'react';

import { slugify } from '../../../lib/projectDestination';
import { teammateApi } from '../../teammates/api';
import { useAccountStore } from '../../../state/accountStore';
import { useProjectCreateStore } from '../../../state/projectCreateStore';
import { useWorkspaceStore } from '../../../state/workspaceStore';
import { closeNewProject } from '../../../state/newProject';
import { IntegrationLogo } from '../../settings/IntegrationLogo';
import { Switch } from '../../settings/SettingsShared';

interface Connector { id: string; installed: boolean; account: string | null; credential: { configured?: boolean } }
interface Catalogue { enabled: boolean; integrations: Connector[] }

/**
 * Create the project on GitHub as well as on this computer.
 *
 * The switch is only a switch when the account's GitHub connection actually
 * exists. Without one it is off and disabled, and the row says what to do about
 * it rather than failing at the end of a build — the whole point of asking here
 * is that the answer is known before anything runs.
 *
 * This is separate from "Start a git repository": that one makes a repository
 * in the folder and is not GitHub at all. Both can be on; the local repository
 * is what gets pushed.
 */
export function GithubOption({ name }: { name: string }) {
  const identity = useAccountStore(s => s.snapshot.profile?.email ?? null);
  const on = useProjectCreateStore(s => s.github);
  const setGithub = useProjectCreateStore(s => s.setGithub);
  const [connector, setConnector] = useState<Connector | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    if (!identity) { setState('ready'); setConnector(null); return; }
    setState('loading');
    teammateApi<Catalogue>('connectors')
      .then(data => { if (alive) { setConnector(data.integrations.find(c => c.id === 'github') ?? null); setState('ready'); } })
      .catch(() => { if (alive) setState('error'); });
    return () => { alive = false; };
  }, [identity]);

  const connected = Boolean(connector?.installed);
  // A switch left on by an earlier project must not survive losing the
  // connection: the build would reach the end and then have nowhere to push.
  useEffect(() => { if (!connected && on) setGithub(false); }, [connected, on, setGithub]);

  const openIntegrations = () => {
    closeNewProject();
    useWorkspaceStore.getState().openSettingsSection('ai', 'integrations');
  };

  // Connected, the hint is the repository itself — owner and the project's own
  // name, the way GitHub writes it. A sentence explaining what the switch does
  // is what the switch's label is for, and it read as filler beside a name most
  // people have just typed.
  const owner = connector?.account ?? '';
  const repository = `${owner ? `${owner}/` : ''}${slugify(name)}`;
  const hint = !identity
    ? <>Sign in to Vibyra and connect GitHub to create the repository from here.</>
    : state === 'loading' ? <>Checking your GitHub connection…</>
    : state === 'error' ? <>Vibyra could not check your GitHub connection.</>
    : connected ? <code className="np-github__repo">{repository}</code>
      : <>Connect GitHub to Vibyra to create the repository from here.</>;

  return <div className="np-github">
    <div className="np-github__mark"><IntegrationLogo id="github" size={26} /></div>
    <div className="setting-row__text">
      <span className="setting-row__label">Create it on GitHub</span>
      <span className="setting-row__hint">{hint}</span>
      {state === 'ready' && !connected && <button className="np-quiet np-quiet--start np-github__link" type="button"
        onClick={openIntegrations}>{identity ? 'Connect GitHub in Settings' : 'Open Settings'}</button>}
    </div>
    <div className="setting-row__control">
      <Switch checked={on} label="Create it on GitHub" disabled={!connected}
        onChange={next => setGithub(next)} />
    </div>
  </div>;
}
