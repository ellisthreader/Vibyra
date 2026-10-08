import { computerName } from "../../lib/platform";
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { createGithubRepository, githubPublish } from '../../lib/githubPublish';
import { slugify } from '../../lib/projectDestination';
import { useWorkspaceStore } from '../../state/workspaceStore';

type Props = {
  root: string;
  /** The project's name, which the repository is named after by default. */
  name: string;
  /** Ask again whether Safe Mode applies: publishing leaves a repository here. */
  onPublished(): void;
};

/**
 * Putting the project on the person's own GitHub. The backend creates the
 * repository with their connector token and this computer pushes with its own
 * git credentials, so a token Vibyra holds never gains the power to write
 * somebody's source.
 *
 * It keeps its own button and its own form because it is the one action on
 * this page that sends files off the machine: nothing here happens until a
 * name and a visibility have been confirmed.
 */
export function WorktreesPublish({ root, name, onPublished }: Props) {
  const [asking, setAsking] = useState(false);
  const [repository, setRepository] = useState(() => slugify(name) || 'project');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [progress, setProgress] = useState('');
  const [failure, setFailure] = useState('');
  const [published, setPublished] = useState<{ fullName: string; htmlUrl: string } | null>(null);
  const wanted = slugify(repository);
  const busy = progress !== '';

  const publish = async () => {
    if (!wanted || busy) return;
    setFailure('');
    setProgress('Creating the repository…');
    try {
      const created = await createGithubRepository(wanted, visibility === 'private');
      const outcome = await githubPublish(crypto.randomUUID(), root, created, event => {
        if (event.type === 'step') setProgress(`${event.label}…`);
      });
      if (!outcome.ok) {
        // The repository exists by now; say so, so nobody publishes twice.
        setFailure(`${outcome.message ?? 'The push did not finish.'} ${created.fullName} is on GitHub, empty.`);
        return;
      }
      setPublished(created);
    } catch (error) {
      setFailure(String(error).replace(/^[a-z ]+error: /, ''));
    } finally {
      setProgress('');
    }
  };

  if (published) {
    return <div className="worktrees-safe__publish">
      <p className="worktrees-safe__published">
        Published to <button className="worktree-repo__link" onClick={() => void invoke('shared_chat_open_link', { url: published.htmlUrl })}>
          {published.fullName}<span aria-hidden="true"> ↗</span>
        </button>
      </p>
      <button className="worktrees-safe__enable" onClick={onPublished}>Continue</button>
    </div>;
  }
  if (!asking) {
    return <button className="worktrees-safe__secondary" onClick={() => setAsking(true)}>
      Or put it on GitHub
    </button>;
  }
  return <div className="worktrees-safe__publish">
    <label className="worktrees-safe__field">
      <span>Repository name</span>
      <input value={repository} disabled={busy} spellCheck={false} autoFocus
        onChange={event => setRepository(event.target.value)} />
    </label>
    <div className="worktrees-safe__visibility" role="group" aria-label="Who can see it">
      {(['private', 'public'] as const).map(choice =>
        <button key={choice} type="button" aria-pressed={visibility === choice} disabled={busy}
          onClick={() => setVisibility(choice)}>{choice === 'private' ? 'Private' : 'Public'}</button>)}
    </div>
    <button className="worktrees-safe__enable" disabled={busy || !wanted} onClick={() => void publish()}>
      {busy ? progress : 'Create repository and push'}
    </button>
    {failure && <p className="worktrees-safe__failure" role="alert">
      {failure} <button className="worktree-link" onClick={() => useWorkspaceStore.getState().openSettingsSection('ai', 'integrations')}>Check GitHub</button>
    </p>}
    <small>Creates {visibility === 'private' ? 'a private' : 'a public'} repository named {wanted || '…'} on your
      GitHub account and pushes this folder to it. Needs GitHub connected and git credentials on this {computerName}.</small>
  </div>;
}
