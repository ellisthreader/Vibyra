/** Keep the initial browser route inside the authenticated Preview proxy. */
export function previewStartUrl(url: string, startPath: string): string {
  if (startPath === '/') return url;
  if (
    !startPath.startsWith('/') ||
    startPath.startsWith('//') ||
    startPath.length > 2048 ||
    /[\\#\r\n]/.test(startPath)
  )
    throw new Error('Invalid Preview opening path.');
  return `${url}?start=${encodeURIComponent(startPath)}`;
}
