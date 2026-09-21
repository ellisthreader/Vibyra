/** In a browser the equivalent of the share sheet is the clipboard. */
export async function keepText(_title: string, text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
