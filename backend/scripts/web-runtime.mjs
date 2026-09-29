import { execFileSync, spawnSync } from 'node:child_process';
import { chownSync, chmodSync, mkdirSync } from 'node:fs';
import { userInfo } from 'node:os';
import { join } from 'node:path';

export function serviceIdentity(env = process.env) {
  const root = process.getuid?.() === 0;
  if (root && (!env.VIBYRA_FPM_USER || !env.VIBYRA_FPM_GROUP)) {
    throw new Error('Set VIBYRA_FPM_USER and VIBYRA_FPM_GROUP to an existing non-root service account');
  }
  const user = env.VIBYRA_FPM_USER || userInfo().username;
  if (!/^[A-Za-z0-9_-]+$/.test(user)) throw new Error('Invalid service user');
  const id = flag => execFileSync('id', [flag, user], { encoding: 'utf8' }).trim();
  const uid = Number(id('-u'));
  const groups = id('-Gn').split(/\s+/);
  const gids = id('-G').split(/\s+/).map(Number);
  const group = env.VIBYRA_FPM_GROUP || id('-gn');
  const gid = gids[groups.indexOf(group)];
  if (!/^[A-Za-z0-9_-]+$/.test(group) || !Number.isInteger(uid) || !Number.isInteger(gid)
    || uid === 0 || (!root && uid !== process.getuid())) throw new Error('Invalid non-root service identity/group');
  return { user, group, uid, gid };
}

export function prepareRuntime(runtime, identity) {
  chmodSync(runtime, 0o755);
  for (const name of ['body', 'fastcgi']) {
    const path = join(runtime, name); mkdirSync(path, { mode: 0o700 });
    if (process.getuid?.() === 0) chownSync(path, identity.uid, identity.gid);
  }
}

export function verifyApplicationWrites(root, identity) {
  const paths = ['storage/framework', 'storage/logs', 'bootstrap/cache'].map(path => join(root, path));
  // Execute the probe as the exact PHP worker identity, not the root supervisor.
  // Do not change ownership of application code, credentials, or mounted secrets.
  const script = `const fs=require('node:fs');
    function check(path) { const stat=fs.lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error('Symlink in writable runtime tree: '+path);
      fs.accessSync(path, fs.constants.R_OK|fs.constants.W_OK|(stat.isDirectory()?fs.constants.X_OK:0));
      if(stat.isDirectory()) for(const name of fs.readdirSync(path)) check(require('node:path').join(path,name)); }
    for(const path of process.argv.slice(1)) check(path);`;
  const result = spawnSync(process.execPath, ['-e', script, ...paths], {
    uid: identity.uid, gid: identity.gid, encoding: 'utf8', timeout: 10000,
  });
  if (result.error || result.status !== 0) {
    throw new Error('PHP service user cannot write runtime files. Provision ownership for storage/framework, storage/logs and bootstrap/cache before startup. '+(result.stderr || result.error?.message || ''));
  }
}
