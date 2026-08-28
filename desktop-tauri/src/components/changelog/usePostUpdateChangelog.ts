import { getVersion } from "@tauri-apps/api/app";
import { useCallback, useEffect, useState } from "react";

import {
  rememberPostUpdateChangelog,
  shouldShowPostUpdateChangelog,
} from "../../lib/postUpdateChangelogPolicy";
import { changelogForVersion, type DesktopChangelog } from "./changelogContent";

interface ChangelogState {
  content: DesktopChangelog;
  persistDismissal: boolean;
}

const SURFACE_WAIT_TIMEOUT_MS = 5 * 60_000;

function previewVersion(): string | null {
  if (!import.meta.env.DEV) return null;
  return import.meta.env.VITE_CHANGELOG_PREVIEW_VERSION?.trim() || null;
}

function waitForReadySurface(onReady: () => void): () => void {
  const root = document.querySelector("#root");
  let frame = 0;
  let timeout = 0;
  const ready = () => {
    const surface = document.querySelector(".auth__viewport, .app > .shell");
    return Boolean(surface) && !document.querySelector(".first-welcome");
  };
  const observer = new MutationObserver(() => {
    if (!ready()) return;
    observer.disconnect();
    window.clearTimeout(timeout);
    frame = window.requestAnimationFrame(onReady);
  });
  if (ready()) {
    frame = window.requestAnimationFrame(onReady);
  } else if (root) {
    observer.observe(root, { childList: true, subtree: true });
    timeout = window.setTimeout(() => observer.disconnect(), SURFACE_WAIT_TIMEOUT_MS);
  }
  return () => {
    observer.disconnect();
    window.clearTimeout(timeout);
    window.cancelAnimationFrame(frame);
  };
}

export function usePostUpdateChangelog() {
  const [state, setState] = useState<ChangelogState | null>(null);

  useEffect(() => {
    const preview = previewVersion();
    if (import.meta.env.DEV && !preview) return;
    let active = true;
    let stopWaiting = () => {};
    const installedVersion = preview ? Promise.resolve(preview) : getVersion();
    void installedVersion.then((version) => {
      if (!active) return;
      const content = changelogForVersion(version);
      if (!content || (!preview && !shouldShowPostUpdateChangelog(
        version,
        undefined,
        content.allowUnmarkedLaunch,
      ))) return;
      stopWaiting = waitForReadySurface(() => {
        if (active) setState({ content, persistDismissal: !preview });
      });
    }).catch((error) => {
      console.warn("post-update changelog unavailable", error);
    });
    return () => {
      active = false;
      stopWaiting();
    };
  }, []);

  const dismiss = useCallback(() => {
    if (state?.persistDismissal) rememberPostUpdateChangelog(state.content.version);
    setState(null);
  }, [state]);

  return { content: state?.content ?? null, dismiss };
}
