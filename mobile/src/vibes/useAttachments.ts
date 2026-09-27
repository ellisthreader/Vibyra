import { useEffect, useRef, useState } from 'react';
import { VibesError } from './api';
import type { AttachmentSource, VibesAttachment } from './types';
import { attachmentDraftKey, attachmentDrafts, updateAttachmentDrafts } from './attachmentMemory';

/** The server's own limit for one message. */
export const ATTACHMENT_LIMIT = 4;
export interface Attached {
  key: string;
  kind: VibesAttachment['kind'];
  name: string;
  uri: string;
  status: 'uploading' | 'ready' | 'failed';
  id?: string;
}
const kindOf = (source: AttachmentSource): Attached['kind'] =>
  source.mimeType.startsWith('image/')
    ? 'image'
    : source.mimeType === 'application/pdf' || /\.pdf$/i.test(source.name)
      ? 'pdf'
      : 'text';

/**
 * The photos and files waiting to go with the next message. Each uploads the moment
 * it is picked, so the quote can price it while the person is still typing, and a
 * failure is said at once rather than discovered on send.
 */
export function useAttachments(
  upload: ((source: AttachmentSource) => Promise<VibesAttachment>) | undefined,
  onError: (message: string) => void,
  scope = 'default',
  owner = 'default',
) {
  const [draftState, setDrafts] = useState(() => ({ owner, entries: attachmentDrafts(owner) }));
  const drafts = draftState.owner === owner ? draftState.entries : attachmentDrafts(owner);
  const current = useRef(drafts);
  const mounted = useRef(true);
  const activeOwner = useRef(owner);
  activeOwner.current = owner;
  current.current = drafts;
  useEffect(() => {
    mounted.current = true;
    current.current = attachmentDrafts(owner);
    setDrafts({ owner, entries: current.current });
    return () => {
      mounted.current = false;
    };
  }, [owner]);
  const items = drafts[scope] ?? [];
  const setItems = (change: (items: Attached[]) => Attached[]) => {
    if (activeOwner.current !== owner) return;
    // Each upload finishes in the chat that opened it, even after navigation.
    const next = updateAttachmentDrafts(owner, scope, change(attachmentDrafts(owner)[scope] ?? []));
    current.current = next;
    if (mounted.current) setDrafts({ owner, entries: next });
  };
  const patch = (key: string, change: Partial<Attached>) =>
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...change } : item)),
    );
  const add = (sources: AttachmentSource[]) => {
    const room = ATTACHMENT_LIMIT - (current.current[scope]?.length ?? 0);
    if (sources.length > room)
      onError(`Attach up to ${ATTACHMENT_LIMIT} photos or files at a time.`);
    for (const source of sources.slice(0, Math.max(0, room))) {
      const key = attachmentDraftKey();
      setItems((current) => [
        ...current,
        { key, kind: kindOf(source), name: source.name, uri: source.uri, status: 'uploading' },
      ]);
      if (!upload) {
        patch(key, { status: 'failed' });
        onError('Photos and files are not available here.');
        continue;
      }
      upload(source)
        .then((saved) => patch(key, { status: 'ready', id: saved.id, kind: saved.kind }))
        .catch((error) => {
          if (!current.current[scope]?.some((item) => item.key === key)) return;
          patch(key, { status: 'failed' });
          // A server without the attachments route answers 404 or 405, which the API
          // words for the whole chat; here it is only photos and files that are missing.
          const missing =
            error instanceof VibesError && (error.status === 404 || error.status === 405);
          onError(
            missing
              ? 'Photos and files aren’t available on this server yet.'
              : error instanceof Error
                ? error.message
                : 'That attachment could not be uploaded.',
          );
        });
    }
  };
  return {
    items,
    add,
    remove: (key: string) => setItems((current) => current.filter((item) => item.key !== key)),
    clear: () => setItems(() => []),
    clearSent: (keys: string[]) =>
      setItems((current) => current.filter((item) => !keys.includes(item.key))),
    ids: items.flatMap((item) => (item.status === 'ready' && item.id ? [item.id] : [])),
    uploading: items.some((item) => item.status === 'uploading'),
    failed: items.some((item) => item.status === 'failed'),
    photos: items.some((item) => item.kind === 'image'),
    full: items.length >= ATTACHMENT_LIMIT,
  };
}
