/** Browser top-level navigation stays on this Preview's private loopback origin. */
export function previewNavigationAllowed(startUrl: string, nextUrl: string): boolean {
  if (nextUrl === 'about:blank') return true;
  try {
    const start = new URL(startUrl);
    const next = new URL(nextUrl);
    return (
      start.protocol === 'http:' &&
      start.hostname === '127.0.0.1' &&
      next.protocol === 'http:' &&
      next.origin === start.origin &&
      next.username === '' &&
      next.password === ''
    );
  } catch {
    return false;
  }
}

/** A site's own frames (a Cloudflare check, a Stripe form, a YouTube or map
 *  embed) load as they would in Safari; only the page itself is pinned to the
 *  Preview origin. Other ports on the phone's own loopback stay closed, and no
 *  frame may open another app. */
export function previewFrameAllowed(startUrl: string, nextUrl: string): boolean {
  if (/^(about|data|blob):/i.test(nextUrl)) return true;
  if (previewNavigationAllowed(startUrl, nextUrl)) return true;
  try {
    const next = new URL(nextUrl);
    const loopback = /^(127\.|localhost$|\[::1\]$|0\.0\.0\.0$)/i.test(next.hostname);
    return (next.protocol === 'https:' || next.protocol === 'http:') && !loopback &&
      next.username === '' && next.password === '';
  } catch {
    return false;
  }
}

/** The native bootstrap path contains a private token and is never display text. */
export function previewLocation(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.pathname.startsWith('/_vibyra_preview/') ? null : parsed.pathname + parsed.search;
  } catch {
    return null;
  }
}
