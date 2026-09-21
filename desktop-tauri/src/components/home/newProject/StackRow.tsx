import type { ProjectTemplate } from '../../../lib/projectTemplateTypes';
import { CheckIcon } from '../../common/Icons';
import { StackMark } from './StackMark';

/**
 * One stack, led by its own mark. Shared by the kind's own list and the
 * whole-catalog browser so the two cannot drift into looking like different
 * things. A missing toolchain is named, not merely greyed: "Needs flutter" is
 * the whole reason the row cannot be picked.
 *
 * More than one stack can be chosen, so the row ends with a tick when it is on
 * and nothing when it is not. A tick that is simply absent keeps the list quiet
 * — an empty box on every row is a dozen boxes to read before the first name.
 */
export function StackRow({ entry, missing, kindLabel, recommended, selected, autoFocus, index, onPick }: {
  entry: ProjectTemplate;
  /** Required tools Rust has said are not on PATH. */
  missing: string[];
  /** The kind this stack is filed under, shown only while browsing them all. */
  kindLabel?: string;
  /** The safe default for this kind. It was always the first row; now it says so. */
  recommended?: boolean;
  selected: boolean;
  autoFocus?: boolean;
  /** Position in the list, which is the row's turn in the entrance cascade. */
  index?: number;
  onPick: () => void;
}) {
  const blocked = missing.length > 0;
  return <button type="button" role="checkbox" aria-checked={selected} autoFocus={autoFocus}
    className={`np-stack ${selected ? 'np-stack--on' : ''}`} disabled={blocked}
    style={index === undefined ? undefined : ({ '--i': index } as React.CSSProperties)}
    title={blocked ? `Needs ${missing.join(' and ')} — ${entry.docs}` : entry.blurb} onClick={onPick}>
    <StackMark templateId={entry.id} kind={entry.kinds[0]!} />
    <span className="np-stack__text">
      <span className="np-stack__name">
        <strong>{entry.name}</strong>
        {recommended && <em className="np-stack__tag np-stack__tag--rec">Recommended</em>}
        {kindLabel && <em className="np-stack__tag">{kindLabel}</em>}
      </span>
      <small>{entry.blurb}</small>
    </span>
    {blocked
      ? <span className="np-stack__need">Needs {missing.join(' and ')}</span>
      : <span className="np-stack__tick">{selected && <CheckIcon size={17} />}</span>}
  </button>;
}
