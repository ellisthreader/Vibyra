import { useMemo, useState } from "react";

import { kindName } from "../../../lib/projectTemplateKinds";
import { searchTemplates } from "../../../lib/projectStackSearch";
import { useProjectCreateStore } from "../../../state/projectCreateStore";
import { SearchIcon } from "../../common/Icons";
import { missingTools, StackRow } from "./StackRow";

/** Every stack Vibyra can start, searchable — the way out of "my framework is
 * not under the kind I picked". Each row says where it is filed, so choosing
 * from here is not a leap in the dark. */
export function StackBrowser() {
  const kind = useProjectCreateStore((state) => state.kind);
  const tools = useProjectCreateStore((state) => state.tools);
  const selected = useProjectCreateStore((state) => state.templateId);
  const chooseTemplate = useProjectCreateStore((state) => state.chooseTemplate);
  const browseAll = useProjectCreateStore((state) => state.browseAll);
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchTemplates(query), [query]);

  return (
    <>
      <div className="np-search">
        <SearchIcon size={14} />
        <input
          className="np-search__input"
          data-autofocus
          value={query}
          spellCheck={false}
          placeholder="Search every stack — Laravel, Godot, FastAPI…"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {results.length > 0 ? (
        <div className="settings-group">
          {results.map((entry) => (
            <StackRow
              key={entry.id}
              entry={entry}
              missing={missingTools(entry, tools)}
              kindLabel={kindName(entry.kinds[0])}
              selected={selected === entry.id}
              autoFocus={false}
              onPick={() => chooseTemplate(entry.id)}
            />
          ))}
        </div>
      ) : (
        <p className="np-empty">
          Nothing matches “{query.trim()}”. Skip the question and Vibyra will make the folder —
          you can set the project up however you like from the terminal it opens.
        </p>
      )}
      <div className="np-skip">
        <button className="np-quiet" type="button" onClick={() => browseAll(false)}>
          {kind ? `Back to ${kindName(kind).toLowerCase()} stacks` : "Back"}
        </button>
        <button className="np-quiet" type="button" onClick={() => chooseTemplate(null)}>
          Skip — just make a folder
        </button>
      </div>
    </>
  );
}
