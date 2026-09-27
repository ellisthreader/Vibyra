import { useState } from 'react';
import { setUpGitRepository } from '../../ipc/workspace';
import { useLaunchSettingsStore } from '../../state/launchSettingsStore';
import { WorktreesPublish } from './WorktreesPublish';
import './worktreesSafeMode.css';

type Props = {
  projectId: string | null;
  root: string | null;
  /** The project's name, which a published repository is named after. */
  name: string;
  /** False in a folder with no Git repository to branch from. */
  available: boolean;
  /** Ask again whether Safe Mode applies, once Git has been set up here. */
  onSetUp(): void;
};

export function WorktreesSafeMode({ projectId, root, name, available, onSetUp }: Props) {
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState('');
  const enable = () => {
    if (projectId) useLaunchSettingsStore.getState().update(projectId, { safeMode: true });
  };
  // Writes to the person's folder, so the button says exactly what it does and
  // does no more: a repository and a first commit, no remote, nothing pushed.
  const setUp = async () => {
    if (!root || working) return;
    setWorking(true);
    setFailure('');
    try {
      await setUpGitRepository(root);
      onSetUp();
    } catch (error) {
      setFailure(String(error).replace(/^[a-z ]+error: /, ''));
    } finally {
      setWorking(false);
    }
  };
  return <section className="worktrees-safe" aria-labelledby="worktrees-safe-title">
    <div className="worktrees-safe__content">
      <svg className="worktrees-safe__art" width="152" height="100" viewBox="0 0 152 100" fill="none" aria-hidden="true">
        <path className="worktrees-safe__trunk" d="M40 12v76" />
        <path className="worktrees-safe__branch" d="M40 72V62c0-20 72-6 72-32V12" />
        <circle className="worktrees-safe__node" cx="40" cy="16" r="5" />
        <circle className="worktrees-safe__node" cx="40" cy="80" r="5" />
        <circle className="worktrees-safe__halo" cx="112" cy="16" r="15" />
        <circle className="worktrees-safe__tip" cx="112" cy="16" r="5" />
      </svg>
      <span className="worktrees-safe__label">{available ? 'Safe Mode is off' : 'Safe Mode needs Git'}</span>
      <h2 id="worktrees-safe-title">A branch of your own.</h2>
      <p>{available
        ? 'Turn on Safe Mode to give new sessions their own working folder and branch.'
        : 'Safe Mode branches from Git, and this project folder is not a repository yet.'}</p>
      {available
        ? <button className="worktrees-safe__enable" disabled={!projectId} onClick={enable}>
            Turn on Safe Mode <span aria-hidden="true">↗</span>
          </button>
        : <button className="worktrees-safe__enable" disabled={!root || working} onClick={() => void setUp()}>
            {working ? 'Setting up Git…' : 'Set up Git here'}
          </button>}
      {failure && <p className="worktrees-safe__failure" role="alert">{failure}</p>}
      <small>{!projectId
        ? 'Select a project to get started.'
        : available
          ? 'For this project. Existing sessions stay as they are.'
          : 'Makes a Git repository here and commits what is in the folder. Nothing is pushed anywhere.'}</small>
      {!available && root && <WorktreesPublish root={root} name={name} onPublished={onSetUp} />}
    </div>
  </section>;
}
