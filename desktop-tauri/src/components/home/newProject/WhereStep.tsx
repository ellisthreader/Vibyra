import { open as openDialog } from '@tauri-apps/plugin-dialog';

import { abbreviateHome } from '../../../lib/relativeTime';
import { useDestinationState } from '../../../lib/useDestinationState';
import { usePlannedProject, useProjectCreateStore } from '../../../state/projectCreateStore';
import { useProjectStore } from '../../../state/projectStore';
import { FolderIcon } from '../../common/Icons';
import { StackMark } from './StackMark';

/**
 * The one question that cannot be skipped, so it is pre-filled and one key from
 * done. The name is the whole screen: a single large field, the way a document
 * is named, rather than a small box under a label among three other labels.
 *
 * Underneath it the folder reads as one sentence — the path in quiet type with
 * the new folder itself picked out — so where the project lands is checked at a
 * glance instead of parsed. The stacks chosen a moment ago are shown above it,
 * because by this screen it is easy to have forgotten which ones they were.
 */
export function WhereStep() {
  const name = useProjectCreateStore(s => s.name);
  const parent = useProjectCreateStore(s => s.parent);
  const setName = useProjectCreateStore(s => s.setName);
  const setParent = useProjectCreateStore(s => s.setParent);
  const go = useProjectCreateStore(s => s.go);
  const homeDir = useProjectStore(s => s.homeDir);
  const planned = usePlannedProject();
  const { destination } = planned;
  // The build refuses a folder that holds someone's files. Say so here, where
  // changing the name is one keystroke, instead of on the build screen.
  const folder = useDestinationState(destination.error ? '' : destination.path);
  const occupied = folder === 'used'
    ? 'That folder already has files in it. Give the project another name.'
    : folder === 'notAFolder'
      ? 'A file of that name is already there. Give the project another name.'
      : '';
  const problem = destination.error ?? occupied;
  const ready = !problem;
  const stacks = [planned.entry, ...planned.extras].filter(entry => entry.id !== 'empty');
  const shown = abbreviateHome(destination.path, homeDir);
  const cut = shown.lastIndexOf('/');

  const choose = async () => {
    const picked = await openDialog({
      directory: true, multiple: false, defaultPath: parent,
      title: 'Where should the project go?',
    }).catch(() => null);
    if (typeof picked === 'string' && picked) setParent(picked);
  };

  return <div className="np-where">
    {stacks.length > 0 && <div className="np-where__stacks">
      {stacks.map(entry => <span key={entry.id} className="np-chip">
        <StackMark templateId={entry.id} kind={entry.kinds[0]!} size={17} />{entry.name}
      </span>)}
    </div>}
    <input className="np-where__name" autoFocus maxLength={64} value={name} spellCheck={false}
      aria-label="Project name" onChange={event => setName(event.target.value)}
      onKeyDown={event => { if (event.key === 'Enter' && ready) go('options'); }} />
    <div className={`np-where__rule ${ready ? '' : 'np-where__rule--bad'}`} />
    <div className="np-where__folder">
      <FolderIcon size={15} />
      <span className="np-where__path">
        {cut > 0 ? shown.slice(0, cut + 1) : shown}
        <strong>{cut > 0 ? shown.slice(cut + 1) : ''}</strong>
      </span>
      <button className="np-quiet np-quiet--inline" type="button" onClick={() => void choose()}>Change</button>
    </div>
    {problem && <p className="np-where__error" role="alert">{problem}</p>}
    <footer className="np-foot">
      <button className="btn btn--primary" type="button" disabled={!ready} onClick={() => go('options')}>
        Continue
      </button>
    </footer>
  </div>;
}
