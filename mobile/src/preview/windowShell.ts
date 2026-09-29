import { previewNavigationAllowed } from './navigation';

/**
 * A computer app's window viewer (served by the Mac or PC) draws its own
 * Preview controls. This tells it what the app can do for it: close the
 * Preview and list the other windows, in the person's accent colour.
 */
export function windowShellScript(options: { targets: boolean; accent: string; label: string }): string {
  return `window.vibyraShell=${JSON.stringify({ close: true, ...options })};true;`;
}

/**
 * Runs a command the window viewer sent from its controls: close, open the
 * window list, or say it draws its own controls (the app then hides its own).
 * Only from the viewer's own page; returns whether the message was one.
 */
export function windowCommand(data: string, url: string, startUrl: string,
  actions: { close(): void; targets?(): void; controls?(): void }): boolean {
  if (data.length > 256 || !previewNavigationAllowed(startUrl, url)) return false;
  try {
    const event = JSON.parse(data);
    if (event.preview !== 1 || event.url !== url) return false;
    if (event.kind === 'close') { actions.close(); return true; }
    if (event.kind === 'targets' && actions.targets) { actions.targets(); return true; }
    if (event.kind === 'controls' && actions.controls) { actions.controls(); return true; }
  } catch { /* Not a command. */ }
  return false;
}
