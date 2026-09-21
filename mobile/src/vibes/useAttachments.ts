import { useRef, useState } from 'react';
import { VibesError } from './api';
import type { AttachmentSource, VibesAttachment } from './types';

/** The server's own limit for one message. */
export const ATTACHMENT_LIMIT = 4;
export interface Attached {
  key: string; kind: VibesAttachment['kind']; name: string; uri: string;
  status: 'uploading' | 'ready' | 'failed'; id?: string;
}
const kindOf = (source: AttachmentSource): Attached['kind'] => source.mimeType.startsWith('image/') ? 'image'
  : source.mimeType === 'application/pdf' || /\.pdf$/i.test(source.name) ? 'pdf' : 'text';

/**
 * The photos and files waiting to go with the next message. Each uploads the moment
 * it is picked, so the quote can price it while the person is still typing, and a
 * failure is said at once rather than discovered on send.
 */
export function useAttachments(upload: ((source: AttachmentSource) => Promise<VibesAttachment>) | undefined,
  onError: (message: string) => void, scope = 'default') {
  const [draft, setDraft] = useState<{ scope: string; items: Attached[] }>({ scope, items: [] });
  const current = useRef(draft); current.current = draft.scope === scope ? draft : { scope, items: [] };
  if (draft.scope !== scope) setDraft(current.current);
  const items = current.current.items;
  const serial = useRef(0);
  const setItems = (change: (items: Attached[]) => Attached[]) => {
    // A picker/upload belongs to the chat that opened it, including while it awaits iOS.
    if (current.current.scope !== scope) return;
    current.current = { scope, items: change(current.current.items) }; setDraft(current.current);
  };
  const patch = (key: string, change: Partial<Attached>) =>
    setItems(current => current.map(item => (item.key === key ? { ...item, ...change } : item)));
  const add = (sources: AttachmentSource[]) => {
    if (current.current.scope !== scope) return;
    const room = ATTACHMENT_LIMIT - current.current.items.length;
    if (sources.length > room) onError(`Attach up to ${ATTACHMENT_LIMIT} photos or files at a time.`);
    for (const source of sources.slice(0, Math.max(0, room))) {
      const key = `attachment-${++serial.current}`;
      setItems(current => [...current, { key, kind: kindOf(source), name: source.name, uri: source.uri, status: 'uploading' }]);
      if (!upload) { patch(key, { status: 'failed' }); onError('Photos and files are not available here.'); continue; }
      upload(source).then(saved => patch(key, { status: 'ready', id: saved.id, kind: saved.kind })).catch(error => {
        if (current.current.scope !== scope || !current.current.items.some(item => item.key === key)) return;
        patch(key, { status: 'failed' });
        // A server without the attachments route answers 404 or 405, which the API
        // words for the whole chat; here it is only photos and files that are missing.
        const missing = error instanceof VibesError && (error.status === 404 || error.status === 405);
        onError(missing ? 'Photos and files aren’t available on this server yet.'
          : error instanceof Error ? error.message : 'That attachment could not be uploaded.');
      });
    }
  };
  return {
    items, add, remove: (key: string) => setItems(current => current.filter(item => item.key !== key)), clear: () => setItems(() => []),
    clearSent: (keys: string[]) => setItems(current => current.filter(item => !keys.includes(item.key))),
    ids: items.flatMap(item => (item.status === 'ready' && item.id ? [item.id] : [])),
    uploading: items.some(item => item.status === 'uploading'), failed: items.some(item => item.status === 'failed'),
    photos: items.some(item => item.kind === 'image'), full: items.length >= ATTACHMENT_LIMIT,
  };
}
