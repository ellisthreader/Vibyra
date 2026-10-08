import { useEffect, useRef, useState } from "react";

import {
  CheckIcon,
  CloseIcon,
  FolderIcon,
  MoreIcon,
  SearchIcon,
} from "../common/Icons";

interface FileTreeToolbarProps {
  rootName: string;
  query: string;
  searchOpen: boolean;
  showGenerated: boolean;
  showHidden: boolean;
  onQuery: (value: string) => void;
  onSearchOpen: (open: boolean) => void;
  onShowGenerated: () => void;
  onShowHidden: () => void;
}

export function FileTreeToolbar(props: FileTreeToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (props.searchOpen) requestAnimationFrame(() => input.current?.focus());
  }, [props.searchOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: globalThis.PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);

  return (
    <div className="file-tree__toolbar">
      <div className="file-tree__topline">
        <span className="file-tree__root" title={props.rootName}>
          <FolderIcon size={13} />
          <strong>{props.rootName}</strong>
        </span>
        <div className="file-tree__actions">
          <button
            className={`icon-btn ${props.searchOpen ? "icon-btn--active" : ""}`}
            aria-label="Filter files"
            title="Filter files"
            onClick={() => props.onSearchOpen(!props.searchOpen)}
          >
            <SearchIcon size={13} />
          </button>
          <div className="file-tree__menu" ref={menu}>
            <button
              className="icon-btn"
              aria-label="File view options"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              title="File view options"
              onClick={() => setMenuOpen((value) => !value)}
            >
              <MoreIcon size={14} />
            </button>
            {menuOpen && (
              <div className="file-tree__popover" role="menu">
                <button role="menuitemcheckbox" aria-checked={props.showHidden} onClick={props.onShowHidden}>
                  <span>{props.showHidden && <CheckIcon size={12} />}</span>
                  Show hidden files
                </button>
                <button role="menuitemcheckbox" aria-checked={props.showGenerated} onClick={props.onShowGenerated}>
                  <span>{props.showGenerated && <CheckIcon size={12} />}</span>
                  Show generated folders
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {props.searchOpen && (
        <label className="file-tree__search">
          <SearchIcon size={13} />
          <input
            ref={input}
            value={props.query}
            placeholder="Filter visible files…"
            aria-label="Filter visible files"
            spellCheck={false}
            onChange={(event) => props.onQuery(event.target.value)}
          />
          <button
            aria-label="Close file filter"
            title="Close filter"
            onClick={() => {
              props.onQuery("");
              props.onSearchOpen(false);
            }}
          >
            <CloseIcon size={12} />
          </button>
        </label>
      )}
    </div>
  );
}
