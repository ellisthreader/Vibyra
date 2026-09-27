import { PROJECT_KINDS } from '../../../lib/projectTemplateKinds';
import { useProjectCreateStore } from '../../../state/projectCreateStore';
import { ProjectKindIcon } from './ProjectKindIcon';

/**
 * Question one, whole on the screen. Nine kinds are exactly a square, so they
 * are drawn as one — three by three, nothing below the fold. The question is
 * answered in a glance and a click, which is the only thing this step is for.
 *
 * The marks are inked in the theme's own colour, not nine of their own. A hue
 * per kind was faster to scan and wrong for this app: the palette is graphite
 * with cobalt for interaction, and nine saturated tiles read as nine unrelated
 * stickers rather than one set of answers. Cobalt is reserved for the one that
 * has been chosen, which is the only thing here worth colour.
 */
export function KindStep() {
  const chooseKind = useProjectCreateStore(s => s.chooseKind);
  const current = useProjectCreateStore(s => s.kind);

  return <>
    <div className="np-grid">
      {PROJECT_KINDS.map((kind, index) => (
        <button key={kind.id} type="button" autoFocus={index === 0}
          className={`np-kind ${current === kind.id ? 'np-kind--on' : ''}`}
          aria-pressed={current === kind.id} title={kind.blurb}
          onClick={() => chooseKind(kind.id)}>
          <ProjectKindIcon kind={kind.id} size={29} />
          <span>{kind.name}</span>
        </button>
      ))}
    </div>
    <footer className="np-foot">
      <button className="np-quiet" type="button" onClick={() => chooseKind(null)}>
        Skip — just make a folder
      </button>
    </footer>
  </>;
}
