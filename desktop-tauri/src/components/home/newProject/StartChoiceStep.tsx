import { useProjectCreateStore } from '../../../state/projectCreateStore';
import { useProjectStore } from '../../../state/projectStore';
import { closeNewProject } from '../../../state/newProject';
import { ChevronIcon } from '../../common/Icons';

/**
 * The fork the ＋ used to skip: build something, or adopt something.
 *
 * No surface behind them. This screen asks a question with exactly two answers,
 * and every box drawn around them — a card, then a card each, then a tile under
 * each mark — was chrome standing in for design. The choices sit on the page,
 * and a ground appears only under the pointer.
 *
 * Building something new leads: its mark is cobalt and it is the one focus
 * lands on. Opening a folder stays neutral. That is the only colour on the
 * screen, which is the whole of the palette's 8%.
 */
const MARKS = {
  // A cross and a folder, on the kind marks' own 24 grid so the whole wizard is
  // drawn by one hand.
  // A bare cross. The frame that used to be drawn round it was the last box on
  // a screen that is meant to have none, and it read as a button rather than a
  // mark.
  new: ['M12 4.75v14.5M4.75 12h14.5'],
  open: [
    'M3.25 8.5V6.5A1.75 1.75 0 0 1 5 4.75h3.9L11.4 8.5',
    'M3.25 8.5h15.75A1.75 1.75 0 0 1 20.75 10.25v7.25A1.75 1.75 0 0 1 19 19.25H5A1.75 1.75 0 0 1 3.25 17.5Z',
  ],
};

function Choice({ art, lead, title, blurb, onPick }: {
  art: string[]; lead?: boolean; title: string; blurb: string; onPick: () => void;
}) {
  return <button className={`np-choice ${lead ? 'np-choice--lead' : ''}`} type="button"
    autoFocus={lead} onClick={onPick}>
    <span className="np-choice__mark">
      <svg width={28} height={28} viewBox="0 0 24 24" fill="none" aria-hidden="true"
        stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        {art.map(d => <path key={d} d={d} />)}
      </svg>
    </span>
    <span className="np-choice__text">
      <strong>{title}</strong>
      <small>{blurb}</small>
    </span>
    <span className="np-choice__go" aria-hidden="true"><ChevronIcon size={14} /></span>
  </button>;
}

export function StartChoiceStep() {
  const go = useProjectCreateStore(s => s.go);
  const pickAndCreate = useProjectStore(s => s.pickAndCreate);

  const openExisting = () => {
    closeNewProject();
    void pickAndCreate();
  };

  return <div className="np-start">
    <Choice art={MARKS.new} lead title="Start something new"
      blurb="Pick what you are making and Vibyra sets it up for you."
      onPick={() => go('kind')} />
    <Choice art={MARKS.open} title="Open a folder I have"
      blurb="Point at code that already exists. Nothing in it is changed."
      onPick={openExisting} />
  </div>;
}
