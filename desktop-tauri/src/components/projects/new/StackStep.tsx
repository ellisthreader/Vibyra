import { templatesForKind } from "../../../lib/projectTemplates";
import { useProjectCreateStore } from "../../../state/projectCreateStore";
import { ChevronIcon } from "../../common/Icons";
import { StackBrowser } from "./StackBrowser";
import { missingTools, StackRow } from "./StackRow";

/** Question two. Rows, not tiles: the blurb is what picks the stack, and a
 * missing toolchain has to be readable rather than merely greyed out. */
export function StackStep() {
  const kind = useProjectCreateStore((state) => state.kind);
  const tools = useProjectCreateStore((state) => state.tools);
  const selected = useProjectCreateStore((state) => state.templateId);
  const chooseTemplate = useProjectCreateStore((state) => state.chooseTemplate);
  const browsing = useProjectCreateStore((state) => state.browsing);
  const browseAll = useProjectCreateStore((state) => state.browseAll);
  const entries = kind ? templatesForKind(kind) : [];

  if (browsing) return <StackBrowser />;

  return (
    <>
      <div className="settings-group">
        {entries.map((entry, index) => (
          <StackRow
            key={entry.id}
            entry={entry}
            missing={missingTools(entry, tools)}
            selected={selected === entry.id}
            autoFocus={index === 0}
            onPick={() => chooseTemplate(entry.id)}
          />
        ))}
        {/* The way out of a shortlist that does not have your framework in it.
            Inside the same card as the stacks, because it is one of the
            answers to this question rather than a separate control. */}
        <button className="np-stack np-stack--other" type="button" onClick={() => browseAll(true)}>
          <span className="np-stack__text">
            <strong>Other…</strong>
            <small>Search every stack Vibyra can start, whatever it is filed under</small>
          </span>
          <span className="np-stack__go np-stack__go--always" aria-hidden="true">
            <ChevronIcon size={13} />
          </span>
        </button>
      </div>
      <div className="np-skip">
        <button className="np-quiet" type="button" onClick={() => chooseTemplate(null)}>
          Skip — just make a folder
        </button>
      </div>
    </>
  );
}
