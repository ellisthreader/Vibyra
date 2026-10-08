/** Never interpret agent links as app commands, file access, or automatic navigation. */
export function safeConversationLink(value: string): string | null {
  if (value.length > 4096 || /[\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
