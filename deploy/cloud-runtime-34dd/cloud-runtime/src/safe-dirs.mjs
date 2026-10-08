import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';

/**
 * Root must never chown, rm or mkdir inside a path uid 1001 can replace. The three volume directories sit directly
 * under the root-owned mount point, so root only ever touches those entries, and only after checking that the
 * parent is root-owned and closed to group/other writes. Existing entries are opened with O_NOFOLLOW|O_DIRECTORY
 * and changed through the open descriptor (fchown), so a symlink swapped in can never be followed.
 */
export const realOps = { chownFd: (fh, uid, gid) => fh.chown(uid, gid) };

async function parentIsSafe(parent, trustedUid) {
  const st = await fs.lstat(parent);
  return st.isDirectory() && !st.isSymbolicLink() && st.uid === trustedUid && (st.mode & 0o022) === 0;
}
async function openDir(dir) {
  return fs.open(dir, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_DIRECTORY);
}
/** Make `dir` a real directory owned by uid:gid. Never follows a symlink; a symlink or file in its place is unlinked (the entry only). */
export async function ensureOwnedDir(dir, parent, { uid, gid, trustedUid = 0, ops = realOps }) {
  if (!await parentIsSafe(parent, trustedUid)) throw Error(`Refusing to prepare ${dir}: its parent is not a root-owned, closed directory`);
  let fh = await openDir(dir).catch(e => (e.code === 'ENOENT' ? null : e));
  if (fh instanceof Error) {
    // ELOOP (symlink) or ENOTDIR (file): remove the entry itself. unlink never follows, and the parent is trusted.
    await fs.unlink(dir);
    fh = null;
  }
  if (!fh) { await fs.mkdir(dir, { mode: 0o755 }); fh = await openDir(dir); }
  try { await ops.chownFd(fh, uid, gid); } finally { await fh.close(); }
}
/** Runs a command as the project user (or as ourselves when uid is null), so any traversal happens with 1001's own rights. */
export function runAsUser(cmd, args, { uid = null, gid = null, cwd = '/', timeoutMs = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: 'ignore', env: { PATH: '/usr/bin:/bin' }, ...(uid != null ? { uid, gid: gid ?? uid } : {}) });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(Error(`${cmd} failed`)); });
  });
}
