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
