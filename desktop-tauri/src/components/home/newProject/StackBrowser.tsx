import { useMemo, useState } from 'react';

import { kindName } from '../../../lib/projectTemplateKinds';
import { searchTemplates } from '../../../lib/projectStackSearch';
import { missingTools } from '../../../lib/projectTemplates';
import type { ProjectTemplate } from '../../../lib/projectTemplateTypes';
import { useProjectCreateStore } from '../../../state/projectCreateStore';
import { SearchIcon } from '../../common/Icons';
import { StackRow } from './StackRow';

/**
 * Every stack Vibyra can start, searchable: the way out of "my framework is
 * not under the kind I picked". Each row says where it is filed, so choosing
 * from here is not a leap in the dark.
 */
export function StackBrowser({ onPick }: { onPick: (entry: ProjectTemplate) => void }) {
  const kind = useProjectCreateStore(s => s.kind);
  const tools = useProjectCreateStore(s => s.tools);
  const selected = useProjectCreateStore(s => s.templateId);
  const extras = useProjectCreateStore(s => s.extraIds);
  const chooseTemplate = useProjectCreateStore(s => s.chooseTemplate);
  const browseAll = useProjectCreateStore(s => s.browseAll);
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchTemplates(query), [query]);

  return <>
    <div className="np-search">
      <SearchIcon size={15} />
      <input className="np-search__input" autoFocus value={query} spellCheck={false}
        aria-label="Search every stack" placeholder="Search every stack — Laravel, Godot, FastAPI…"
        onChange={event => setQuery(event.target.value)} />
    </div>
    {results.length > 0
      ? <div className="np-list">
        {results.map(entry => <StackRow key={entry.id} entry={entry} missing={missingTools(entry, tools)}
          kindLabel={kindName(entry.kinds[0]!)} selected={entry.id === selected || extras.includes(entry.id)}
          onPick={() => onPick(entry)} />)}
      </div>
      : <p className="np-empty">
        Nothing matches “{query.trim()}”. Skip the question and Vibyra will make the folder — you can
        set the project up however you like from a terminal in it.
      </p>}
    <footer className="np-foot">
      <button className="np-quiet" type="button" onClick={() => browseAll(false)}>
        {kind ? `Back to ${kindName(kind).toLowerCase()} stacks` : 'Back'}
      </button>
      <button className="np-quiet" type="button" onClick={() => chooseTemplate(null)}>
        Skip — just make a folder
      </button>
    </footer>
  </>;
}
