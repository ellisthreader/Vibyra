import { useEffect, useMemo, useRef, useState } from "react";

import { parseMemoryDocument } from "../../lib/memoryDocument";
import { memoryNoteTitle, resolveMemoryLink } from "../../lib/memoryTree";
import { useMemoryStore } from "../../state/memoryStore";
import {
  memoryVaultNoteKey,
  useMemoryVaultStore,
} from "../../state/memoryVaultStore";
import { useProjectStore } from "../../state/projectStore";
import { MemoryEmptyState } from "./MemoryEmptyState";
import { MemoryMarkdown } from "./MemoryMarkdown";
import { MemoryNavigator } from "./MemoryNavigator";
import { MemorySourceBar } from "./MemorySourceBar";
import { MemoryToolbar } from "./MemoryToolbar";

export function MemoryPanel() {
  const projectId = useProjectStore((state) => state.activeId);
  const key = projectId ?? "global";
  const content = useMemoryStore((state) => state.contents[key] ?? "");
  const loaded = useMemoryStore((state) => Boolean(state.loaded[key]));
  const sources = useMemoryStore((state) => state.sources[key]);
  const sourcesLoaded = useMemoryStore((state) => Boolean(state.sourcesLoaded[key]));
  const saving = useMemoryStore((state) => state.saving);
  const busy = useMemoryStore((state) => state.sourceBusy);
  const sourceError = useMemoryStore((state) => state.sourceError);
  const notice = useMemoryStore((state) => state.notice);
  const load = useMemoryStore((state) => state.load);
  const setContent = useMemoryStore((state) => state.setContent);
  const connectVault = useMemoryStore((state) => state.connectVault);
  const disconnectVault = useMemoryStore((state) => state.disconnectVault);
  const importFiles = useMemoryStore((state) => state.importFiles);
  const index = useMemoryVaultStore((state) => state.indexes[key]);
  const indexLoading = useMemoryVaultStore((state) => Boolean(state.indexLoading[key]));
  const loadIndex = useMemoryVaultStore((state) => state.loadIndex);
  const loadNote = useMemoryVaultStore((state) => state.loadNote);
  const clearVault = useMemoryVaultStore((state) => state.clear);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [view, setView] = useState<"read" | "edit">("read");
  const documentPane = useRef<HTMLElement>(null);
  const vaultId = sources?.vault?.id ?? "";
  const noteKey = selectedPath && vaultId
    ? memoryVaultNoteKey(key, vaultId, selectedPath)
    : "";
  const vaultNote = useMemoryVaultStore((state) => noteKey ? state.notes[noteKey] : undefined);
  const noteLoading = useMemoryVaultStore((state) => noteKey ? Boolean(state.noteLoading[noteKey]) : false);
  const vaultError = useMemoryVaultStore((state) => noteKey
    ? state.errors[noteKey]
    : state.errors[key]);

  useEffect(() => { void load(key); }, [key, load]);
  useEffect(() => {
    setSelectedPath(null);
    setView("read");
    if (vaultId) void loadIndex(key, vaultId);
  }, [key, vaultId, loadIndex]);
  useEffect(() => {
    if (selectedPath && vaultId) void loadNote(key, vaultId, selectedPath);
  }, [key, vaultId, selectedPath, loadNote]);

  const local = selectedPath === null;
  const visibleContent = local ? content : vaultNote?.content ?? "";
  // While editing, only the navigator reads the parse — keep the last parsed
  // outline instead of re-running the full line parser per keystroke.
  const lastModel = useRef(parseMemoryDocument(""));
  const model = useMemo(() => {
    if (view !== "edit") lastModel.current = parseMemoryDocument(visibleContent);
    return lastModel.current;
  }, [view, visibleContent]);
  const ready = loaded && sourcesLoaded;
  const empty = ready && !content.trim() && !sources?.vault;
  const paths = index?.vaultId === vaultId ? index.paths : [];
  const title = local ? "MEMORY.md" : memoryNoteTitle(selectedPath);
  const error = sourceError ?? sources?.warning ?? null;
  const selectPath = (path: string | null) => {
    setSelectedPath(path);
    setView("read");
  };
  const scrollHeading = (id: string) => {
    setView("read");
    requestAnimationFrame(() => {
      documentPane.current?.querySelector<HTMLElement>(`#${CSS.escape(id)}`)?.scrollIntoView({ block: "start" });
    });
  };
  const disconnect = async () => {
    setSelectedPath(null);
    clearVault(key);
    await disconnectVault(key);
  };
  const openWikiLink = (target: string) => {
    const path = resolveMemoryLink(paths, target);
    if (path) selectPath(path);
  };

  return (
    <div className="companion-panel companion-panel--memory">
      <MemoryToolbar
        saving={saving}
        busy={busy}
        notice={notice}
        showImport={ready && !empty}
        title={title}
        local={local}
        view={view}
        onView={setView}
        onConnectVault={() => void connectVault(key)}
        onImportFiles={() => void importFiles(key)}
      />
      {sources?.vault && (
        <MemorySourceBar vault={sources.vault} busy={busy} onDisconnect={() => void disconnect()} />
      )}
      {empty ? (
        <MemoryEmptyState
          suggestions={sources?.suggestions ?? []}
          busy={busy}
          error={error}
          onConnect={(candidateId) => void connectVault(key, candidateId)}
          onImport={() => void importFiles(key)}
        />
      ) : ready ? (
        <div className="memory-workbench">
          <MemoryNavigator
            vault={sources?.vault ?? null}
            paths={paths}
            limited={Boolean(index?.limited)}
            loading={indexLoading}
            selectedPath={selectedPath}
            headings={model.headings}
            onSelectPath={selectPath}
            onHeading={scrollHeading}
          />
          <section className="memory-document" ref={documentPane}>
            {(error || vaultError) && (
              <div className="memory-inline-error" role="alert">{vaultError ?? error}</div>
            )}
            {local && view === "edit" ? (
              <textarea
                className="memory-area"
                value={content}
                placeholder="Write project decisions, conventions, and context…"
                aria-label="Project memory Markdown"
                spellCheck={false}
                onChange={(event) => setContent(key, event.target.value)}
              />
            ) : noteLoading ? (
              <div className="memory-loading" role="status">Opening note…</div>
            ) : (
              <MemoryMarkdown
                model={model}
                emptyCopy={local ? "Start writing project memory, or choose a note from the vault." : "This note is empty."}
                onWikiLink={openWikiLink}
              />
            )}
          </section>
        </div>
      ) : (
        <div className="memory-loading" role="status">Looking for existing memory…</div>
      )}
    </div>
  );
}
