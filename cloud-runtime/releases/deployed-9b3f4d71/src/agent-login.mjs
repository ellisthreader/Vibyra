import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';

export const cloudAccountIdentity = token => `cloud-${createHash('sha256').update(token).digest('hex').slice(0, 32)}`;
export const validCloudToken = value => typeof value === 'string' && /^sk-ant-oat01-[A-Za-z0-9_-]{20,1000}$/.test(value);
/** Root reads only the separately granted Cloud token; no project-owned settings or paths reach the Agent. */
export async function readCloudAgentToken(home = '/data/home') {
  const opened = [];
  const open = async (path, flags) => { const handle = await fs.open(path, flags); opened.push(handle); return handle; };
  const relative = (handle, fallback, child) => process.platform === 'linux' ? `/proc/self/fd/${handle.fd}/${child}` : `${fallback}/${child}`;
  try {
    const directory = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
    const root = await open(home, directory);
    const claude = await open(relative(root, home, '.claude'), directory);
    const file = await open(relative(claude, `${home}/.claude`, 'settings.json'), constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await file.stat(); if (!stat.isFile() || stat.size > 4 * 1024 * 1024) return null;
    const bytes = Buffer.alloc(4 * 1024 * 1024 + 1); const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead > 4 * 1024 * 1024) return null;
    const value = JSON.parse(bytes.subarray(0, bytesRead).toString('utf8'));
    const token = value?.env?.CLAUDE_CODE_OAUTH_TOKEN;
    return validCloudToken(token) ? token : null;
  } catch { return null; }
  finally { await Promise.allSettled(opened.map(handle => handle.close())); }
}
