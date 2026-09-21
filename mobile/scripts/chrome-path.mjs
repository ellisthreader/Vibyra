import { existsSync } from 'node:fs';

/** Where the verification scripts find a Chrome to drive. CHROME_PATH wins;
 *  otherwise the macOS app, then the Linux package names. A script that
 *  hard-codes one platform's path fails on the other with an unhelpful
 *  "executable doesn't exist" instead of trying what is installed. */
const candidates = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
];
export function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const found = candidates.find(path => existsSync(path));
  if (!found) throw new Error(`No Chrome found at ${candidates.join(', ')}; set CHROME_PATH`);
  return found;
}
