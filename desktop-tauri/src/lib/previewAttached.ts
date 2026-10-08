/** A Mac owner can share only an explicit HTTP IPv4 loopback port. */
export function attachedPreviewPort(address: string): number | null {
  let url: URL;
  try { url = new URL(address); } catch { return null; }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' ||
      url.username || url.password || url.hash || !url.port) return null;
  const port = Number(url.port);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}
