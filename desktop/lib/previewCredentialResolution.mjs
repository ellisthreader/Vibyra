import {
  previewCredentialTargetId,
  replacePreviewCapability
} from "./previewCapabilities.mjs";
import { previewServerProxyUrl } from "./previewUrls.mjs";
import { appState } from "./state.mjs";

export function pinResolvedPreviewToActiveTarget(projectId, url, credential) {
  const targetId = appState.previewServers[String(projectId || "")]?.targetId || "";
  if (!targetId || !isProjectServerPreview(projectId, url)) return { credential, url };
  if (previewCredentialTargetId(credential) === targetId) return { credential, url };
  const pinnedCredential = replacePreviewCapability(projectId, credential, { targetId });
  return {
    credential: pinnedCredential,
    url: previewServerProxyUrl(projectId, pinnedCredential)
  };
}

function isProjectServerPreview(projectId, value) {
  try {
    const url = new URL(String(value || ""), "http://vibyra.local");
    return url.pathname.startsWith(`/preview/server/${encodeURIComponent(projectId)}/`);
  } catch {
    return false;
  }
}
