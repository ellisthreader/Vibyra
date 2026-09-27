import { useEffect, useRef, useState } from "react";

import { useWorkspaceStore } from "../../state/workspaceStore";
import { SearchIcon } from "../common/Icons";
import { SETTINGS_SECTIONS, searchSettings, type SettingsIndexEntry } from "./settingsSections";

/** The left column: a filter field, then the seven pages as coloured tiles,
 * with Advanced set apart below a rule. Typing shows matching settings; picking
 * one opens its page and reveals its group through the store's panel target. */
export function SettingsNav() {
  const active = useWorkspaceStore((state) => state.settingsSection);
  const setActive = useWorkspaceStore((state) => state.setSettingsSection);
  const openTarget = useWorkspaceStore((state) => state.openSettingsSection);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const fieldRef = useRef<HTMLInputElement>(null);
  const hits = searchSettings(query);

  useEffect(() => setCursor(0), [query]);

  // ⌘F / Ctrl+F inside Settings goes to the filter, not the browser's find.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        fieldRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const choose = (hit: SettingsIndexEntry) => {
    openTarget(hit.section, hit.panel);
    setQuery("");
  };

  return (
    <aside className="settings-nav">
      <div className="settings-nav__title">Settings</div>
      <div className="settings-find">
        <SearchIcon size={13} />
        <input
          ref={fieldRef}
          className="settings-find__input"
          type="search"
          placeholder="Find a setting"
          aria-label="Find a setting"
          value={query}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); setCursor((c) => Math.min(hits.length - 1, c + 1)); }
            if (event.key === "ArrowUp") { event.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
            if (event.key === "Enter" && hits[cursor]) choose(hits[cursor]);
            if (event.key === "Escape") setQuery("");
          }}
        />
      </div>
      {query.trim() ? (
        <div className="settings-find__results" role="listbox" aria-label="Matching settings">
          {hits.length === 0 ? <div className="settings-find__empty">No setting matches.</div> : null}
          {hits.map((hit, index) => {
            const section = SETTINGS_SECTIONS.find((item) => item.id === hit.section);
            return (
              <button
                key={`${hit.section}:${hit.label}`}
                type="button"
                role="option"
                aria-selected={index === cursor}
                className={`settings-find__hit ${index === cursor ? "settings-find__hit--active" : ""}`}
                onMouseEnter={() => setCursor(index)}
                onClick={() => choose(hit)}
              >
                <span>{hit.label}</span>
                <small>{section?.label}</small>
              </button>
            );
          })}
        </div>
      ) : (
        <nav className="settings-nav__list" aria-label="Settings sections">
          {SETTINGS_SECTIONS.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.id} className="settings-nav__slot">
                {item.secondary && <div className="settings-nav__sep" role="separator" />}
                <button
                  className={`settings-nav__item ${item.id === active ? "settings-nav__item--active" : ""}`}
                  aria-current={item.id === active ? "page" : undefined}
                  onClick={() => setActive(item.id)}
                >
                  <span className="settings-tile" style={{ background: item.tile }} aria-hidden="true">
                    <Icon size={13} />
                  </span>
                  {item.label}
                </button>
              </div>
            );
          })}
        </nav>
      )}
    </aside>
  );
}
