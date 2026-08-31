import { useMemo, useState } from "react";

import { basename } from "../../lib/projectIdentity";
import { useProjectStore } from "../../state/projectStore";
import { useProjects } from "../../state/settingsStore";

export function HomeLaunchBar() {
  const projects = useProjects();
  const activate = useProjectStore((state) => state.activate);
  const create = useProjectStore((state) => state.create);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const isPath = query.startsWith("/") || query.startsWith("~");
  const suggestions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized || isPath) return [];
    return projects
      .filter((project) => project.name.toLowerCase().includes(normalized))
      .slice(0, 4);
  }, [projects, query, isPath]);

  const run = async (index: number) => {
    if (isPath && query.trim()) {
      const homeDir = useProjectStore.getState().homeDir;
      const path = query.trim().replace(/^~(?=\/|$)/, homeDir);
      await create(path);
      setQuery("");
      return;
    }
    const target = suggestions[index];
    if (target) {
      setQuery("");
      await activate(target.id);
    }
  };

  return (
    <div className="launch">
      <div className="launch__bar">
        <span className="launch__prompt">❯</span>
        <input
          className="launch__input"
          data-welcome-focus
          value={query}
          placeholder="Open a project, or paste a folder path to add one…"
          spellCheck={false}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void run(selected);
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              setSelected((value) => Math.min(value + 1, suggestions.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setSelected((value) => Math.max(value - 1, 0));
            } else if (event.key === "Escape") {
              setQuery("");
            }
          }}
        />
        <kbd className="kbd">Ctrl K</kbd>
      </div>
      {(suggestions.length > 0 || (isPath && query.trim().length > 1)) ? (
        <div className="launch__drop">
          {suggestions.map((project, index) => (
            <button
              key={project.id}
              className={`launch__row ${index === selected ? "launch__row--sel" : ""}`}
              onMouseEnter={() => setSelected(index)}
              onClick={() => void run(index)}
            >
              <span className="launch__mono" style={{ "--hc": project.color } as React.CSSProperties}>
                {project.name.charAt(0).toUpperCase()}
              </span>
              Open <strong>{project.name}</strong>
            </button>
          ))}
          {isPath && query.trim().length > 1 ? (
            <button className="launch__row launch__row--sel" onClick={() => void run(0)}>
              <span className="launch__mono">＋</span>
              Add project <strong>{basename(query.trim())}</strong>
              <small>{query.trim()}</small>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
