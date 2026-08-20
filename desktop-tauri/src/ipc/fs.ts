import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { DirEntryInfo, FilePreview, FsChange } from "../types";

export function fsListDir(path: string, showHidden: boolean): Promise<DirEntryInfo[]> {
  return invoke("fs_list_dir", { path, showHidden });
}

export function fsReadPreview(path: string): Promise<FilePreview> {
  return invoke("fs_read_preview", { path });
}

export function fsHomeDir(): Promise<string> {
  return invoke("fs_home_dir");
}

export function watchWorkspace(root: string): Promise<void> {
  return invoke("watch_workspace", { root });
}

export function unwatchWorkspace(): Promise<void> {
  return invoke("unwatch_workspace");
}

/** Debounced change batches emitted by the Rust watcher. */
export function onFsChanged(callback: (changes: FsChange[]) => void): Promise<UnlistenFn> {
  return listen<FsChange[]>("fs:changed", (event) => callback(event.payload));
}
