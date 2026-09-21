import { additionsFor, canLayer, missingTools, templatesForKind } from '../../../lib/projectTemplates';
import type { ProjectTemplate } from '../../../lib/projectTemplateTypes';
import { useProjectCreateStore } from '../../../state/projectCreateStore';
import { ChevronIcon } from '../../common/Icons';
import { StackBrowser } from './StackBrowser';
import { StackRow } from './StackRow';

/**
 * Question two. One list, rows not tiles: the blurb is what picks the stack,
 * and a missing toolchain has to be readable rather than merely greyed out.
 * The recommended stack leads it and says so.
 *
 * More than one can be chosen. The list runs the kind's own stacks first, then
 * the things worth putting inside whichever of them is picked — a server, a
 * model layer — because a project is often two of these and picking the second
 * one should not mean starting again.
 *
 * Only one stack can make the folder, though: two scaffolders both expecting to
 * own an empty directory is the second one failing on the first one's files. So
 * choosing another of those quietly takes the place of the last, while the ones
 * that only add files inside simply accumulate. The ticks always show what is
 * actually going to be built.
 */
export function StackStep() {
  const kind = useProjectCreateStore(s => s.kind);
  const tools = useProjectCreateStore(s => s.tools);
  const selected = useProjectCreateStore(s => s.templateId);
  const extras = useProjectCreateStore(s => s.extraIds);
  const browsing = useProjectCreateStore(s => s.browsing);
  const chooseTemplate = useProjectCreateStore(s => s.chooseTemplate);
  const toggleExtra = useProjectCreateStore(s => s.toggleExtra);
  const continueStack = useProjectCreateStore(s => s.continueStack);
  const browseAll = useProjectCreateStore(s => s.browseAll);

  const pick = (entry: ProjectTemplate) => canLayer(entry) ? toggleExtra(entry.id) : chooseTemplate(entry.id);
  if (browsing) return <StackBrowser onPick={pick} />;

  const own = kind ? templatesForKind(kind) : [];
  const entries = kind ? [...own, ...additionsFor(kind, selected)] : [];
  const on = (entry: ProjectTemplate) => entry.id === selected || extras.includes(entry.id);

  return <>
    <div className="np-list np-list--enter">
      {entries.map((entry, index) => <StackRow key={entry.id} entry={entry} missing={missingTools(entry, tools)}
        recommended={index === 0} selected={on(entry)} autoFocus={index === 0} index={index}
        onPick={() => pick(entry)} />)}
      {/* The way out of a shortlist that does not have your framework in it.
          Inside the same list as the stacks, because it is one of the answers
          to this question rather than a separate control. */}
      <button className="np-stack np-stack--other" type="button" onClick={() => browseAll(true)}
        style={{ '--i': entries.length } as React.CSSProperties}>
        {/* Its own mark, so the row's text starts where every other row's does. */}
        <span className="np-mark np-mark--kind" style={{ width: 26, height: 26 }}>
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden="true"
            stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.75 4.5a6.25 6.25 0 1 1 0 12.5 6.25 6.25 0 0 1 0-12.5Z" />
            <path d="m15.4 15.4 4.1 4.1" />
          </svg>
        </span>
        <span className="np-stack__text">
          <span className="np-stack__name"><strong>Other…</strong></span>
          <small>Search every stack Vibyra can start, whatever it is filed under</small>
        </span>
        <span className="np-stack__tick"><ChevronIcon size={13} /></span>
      </button>
    </div>
    <footer className="np-foot">
      <button className="btn btn--primary" type="button" disabled={!selected && extras.length === 0}
        onClick={continueStack}>Continue</button>
      <button className="np-quiet" type="button" onClick={() => chooseTemplate(null)}>
        Skip — just make a folder
      </button>
    </footer>
  </>;
}
