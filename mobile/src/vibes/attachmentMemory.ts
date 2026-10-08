import type { Attached } from './useAttachments';

// Uploaded IDs and local image URIs survive a chat screen being evicted from the
// mounted view cache. They remain device-memory only and are cleared on account change.
const drafts = new Map<string, Record<string, Attached[]>>();
const previews = new Map<string, Record<string, string>>();
let nextDraftAttachment = 0;

export function attachmentDraftKey() {
  return `attachment-${++nextDraftAttachment}`;
}

export function attachmentDrafts(owner: string) {
  return drafts.get(owner) ?? {};
}
export function updateAttachmentDrafts(owner: string, scope: string, items: Attached[]) {
  const next = { ...attachmentDrafts(owner) };
  if (items.length) next[scope] = items;
  else delete next[scope];
  if (Object.keys(next).length) drafts.set(owner, next);
  else drafts.delete(owner);
  return next;
}
export function attachmentPreviews(owner: string) {
  let saved = previews.get(owner);
  if (!saved) {
    saved = {};
    previews.set(owner, saved);
  }
  return saved;
}
export function clearAttachmentMemory(prefix: string) {
  for (const key of drafts.keys()) if (key.startsWith(prefix)) drafts.delete(key);
  for (const key of previews.keys()) if (key.startsWith(prefix)) previews.delete(key);
}
