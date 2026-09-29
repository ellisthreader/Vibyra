import { createContext } from 'react';

/** A site the agent started on the Mac: the phone cannot open it, but Live Preview can. */
export function macLocalUrl(url: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d{1,5})?(\/|$)/i.test(url.trim());
}

/** Opens Live Preview for a Mac-local link, where the chat can offer it. */
export const LocalLinkContext = createContext<((url: string) => void) | null>(null);
