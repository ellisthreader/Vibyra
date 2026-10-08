/** Where an export can go: the clipboard, else a file the person saves. Injected so node tests need no browser. */
export interface ShareEnv {
  writeText?(text: string): Promise<void>;
  download(filename: string, contentType: string, content: string): void;
}

/** Copies the text; when the clipboard is missing or refuses, downloads it instead. */
export async function shareExport(file: { filename: string; contentType: string; content: string }, env: ShareEnv): Promise<'copied' | 'saved'> {
  if (env.writeText) { try { await env.writeText(file.content); return 'copied'; } catch { /* fall back to a file */ } }
  env.download(file.filename, file.contentType, file.content);
  return 'saved';
}

export const browserShare = (): ShareEnv => ({
  writeText: typeof navigator !== 'undefined' && navigator.clipboard?.writeText ? text => navigator.clipboard.writeText(text) : undefined,
  download(filename, contentType, content) {
    const url = URL.createObjectURL(new Blob([content], { type: contentType }));
    const link = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
});
