import { useEffect, useRef, useState } from 'react';
import type { Anchor } from './AttachMenu';
import { chooseFiles, choosePhotos, takePhoto, type Picked } from './pickAttachments';
import type { AttachmentSource, VibesAttachment } from './types';
import { ATTACHMENT_LIMIT, useAttachments } from './useAttachments';

/** Everything between the composer's + and a message that carries photos and files. */
export function useAttachFlow(upload: ((source: AttachmentSource) => Promise<VibesAttachment>) | undefined, scope = 'default') {
  const [notice, setNotice] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const files = useAttachments(upload, setNotice, scope);
  const active = useRef(scope); active.current = scope;
  useEffect(() => { setNotice(null); setAnchor(null); }, [scope]);
  // The phone's own copies of photos already sent, so the transcript can show the
  // photo itself; the server keeps it only to send it, never to serve it back.
  const previews = useRef<Record<string, string>>({});
  const room = ATTACHMENT_LIMIT - files.items.length;
  const pick = (picking: () => Promise<Picked>) => {
    setNotice(null);
    void picking().then(picked => {
      if (!picked || active.current !== scope) return;
      if ('error' in picked) setNotice(picked.error); else files.add(picked.sources);
    }).catch(error => { if (active.current === scope) setNotice(error instanceof Error ? error.message : 'That could not be opened.'); });
  };
  return {
    files, notice, setNotice, anchor, open: setAnchor, close: () => setAnchor(null), previews: previews.current,
    camera: () => pick(takePhoto), photos: () => pick(() => choosePhotos(room)), documents: () => pick(() => chooseFiles(room)),
    /** The message is on its way: its photos become the transcript's and the tray empties. */
    sent: () => {
      if (active.current !== scope) return;
      for (const item of files.items) if (item.id && item.kind === 'image') previews.current[item.id] = item.uri;
      files.clearSent(files.items.map(item => item.key)); setNotice(null);
    },
  };
}
