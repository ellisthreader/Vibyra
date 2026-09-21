import { useEffect, useRef, useState } from 'react';
import { normalizePreviewUrl } from '../../lib/previewUrl';
import './previewRecovery.css';
import './previewChrome.css';

interface Props { url: string | null; onOpen(url: string): void; }
export function PreviewAddress({ url, onOpen }: Props) {
  const [draft, setDraft] = useState(url ?? '');
  const [error, setError] = useState('');
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setDraft(url ?? ''); }, [url]);
  return <div className="preview-address">
    <form className="preview-omnibox" onSubmit={event => {
      event.preventDefault();
      try { const next = normalizePreviewUrl(draft, window.location.origin); setError(''); editing.current = false; setDraft(next); onOpen(next); }
      catch (e) { setError((e as Error).message); }
    }}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c4 4 4 12 0 16-4-4-4-12 0-16Z"/></svg>
      <input aria-label="Preview URL" placeholder="Enter a URL to preview" value={draft}
        onChange={event => { editing.current = true; setDraft(event.target.value); setError(''); }} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      <button type="submit" aria-label="Open URL" title="Connect to URL"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button>
    </form>
    {error && <p role="alert">{error}</p>}
  </div>;
}
