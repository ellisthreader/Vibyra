/** A typed URL attaches to a site; it never launches or owns its server. */
export function normalizePreviewUrl(input: string, appOrigin = ''): string {
  const value = input.trim();
  if (/^exps?:/i.test(value)) throw new Error('That is an Expo Go link. For this web preview, run npx expo start --web and paste its http:// address. Use Expo Go on your phone for the native app.');
  if (!value) throw new Error('Enter the address of your running site.');
  // Preview connects to running development servers, which may not support TLS.
  // Preserve an explicit scheme; never inherit one from the previous address.
  const address = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `http://${value}`;
  let url: URL;
  try { url = new URL(address); } catch { throw new Error('Enter a valid URL, for example http://localhost:3000.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || /\s/.test(value)) {
    throw new Error('Use an http:// or https:// website address.');
  }
  if (url.username || url.password) throw new Error('Use a URL without a username or password.');
  if (url.origin === appOrigin || ['tauri.localhost', 'asset.localhost'].includes(url.hostname)) {
    throw new Error('Enter your project’s address, not the Vibyra app address.');
  }
  return url.href;
}

export function previewRecovery(error: string | null, logs: string[]): string {
  const text = `${error ?? ''}\n${logs.join('\n')}`;
  if (/react-native-web|react-dom|web.*dependenc/i.test(text)) return 'Expo web needs its web dependencies. In the app folder run npx expo install react-dom react-native-web @expo/metro-runtime, then try again.';
  if (/cannot find module|module not found|not found|enoent|missing.*dependenc/i.test(text)) {
    return 'A required tool or dependency may be missing. Install the project’s dependencies in its terminal, then retry. Or start it yourself and paste its URL above.';
  }
  if (/EADDRINUSE|address already in use/i.test(text)) return 'A server is already using that port. Paste its URL above, or stop it in its terminal before retrying.';
  if (/timed? out|within \d+ seconds/i.test(text)) return 'The server took too long to start. Check the startup details, or start it in a terminal and paste the URL above.';
  return 'Check the startup details below. You can also start the app in its terminal and paste the URL above.';
}
