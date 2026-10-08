// Works out which refs a `git push` will write, so the root credential proxy can ask the backend for a credential
// per branch (git never tells a credential helper the ref). Everything uncertain is refused. Defence in depth only:
// project code runs as the same uid and can forge the claim; the real boundary is the backend + GitHub branch protection.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { isAllowedPushRef } from './push-guard.mjs';

export const PROJECT_UID = 1001;
const MAX_REFS = 8;
class Refuse extends Error {}
const no = why => { throw new Refuse(why); };

/** /proc-backed process facts. Every method returns null when unreadable. */
export const realProc = {
  cmdline(pid) { try { const b = fs.readFileSync(`/proc/${pid}/cmdline`); const s = b.toString('utf8'); return s ? s.replace(/\0$/, '').split('\0') : null; } catch { return null; } },
  ppid(pid) { try { const s = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); return Number(s.slice(s.lastIndexOf(')') + 2).split(' ')[1]) || null; } catch { return null; } },
  cwd(pid) { try { return fs.readlinkSync(`/proc/${pid}/cwd`); } catch { return null; } },
  ids(pid) {
    try { const s = fs.readFileSync(`/proc/${pid}/status`, 'utf8'); const pick = k => Number(new RegExp(`^${k}:\\s+(\\d+)`, 'm').exec(s)?.[1]);
      const uid = pick('Uid'), gid = pick('Gid'); return Number.isInteger(uid) && Number.isInteger(gid) ? { uid, gid } : null; } catch { return null; }
  },
  environ(pid) {
    try { const out = {}; for (const kv of fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0')) { const i = kv.indexOf('='); if (i > 0) out[kv.slice(0, i)] = kv.slice(i + 1); } return out; } catch { return null; }
  },
};

const GLOBAL_FLAG = new Set(['--no-pager', '-p', '-P', '--paginate', '--no-replace-objects', '--literal-pathspecs', '--no-literal-pathspecs', '--glob-pathspecs', '--noglob-pathspecs', '--icase-pathspecs', '--no-optional-locks', '--no-lazy-fetch']);
const UNSAFE_FLAG = new Set(['--bare']);
const UNSAFE_VALUE = new Set(['-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--super-prefix', '--config-env']);
/** Splits git argv (after argv[0]) into {dirs, unsafe, sub, rest}. sub is null when a global option is not understood. */
export function splitGitArgv(args) {
  const out = { dirs: [], unsafe: false, sub: null, rest: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-C') { if (i + 1 >= args.length) return out; out.dirs.push(args[++i]); }
    else if (UNSAFE_VALUE.has(a)) { out.unsafe = true; i++; }
    else if (/^--(git-dir|work-tree|namespace|exec-path|super-prefix|config-env)(=|$)/.test(a)) out.unsafe = true;
    else if (UNSAFE_FLAG.has(a)) out.unsafe = true;
    else if (GLOBAL_FLAG.has(a)) continue;
    else if (a.startsWith('-')) return out;
    else { out.sub = a; out.rest = args.slice(i + 1); return out; }
  }
  return out;
}
const isGit = argv => argv && path.basename(argv[0] ?? '') === 'git';
const SHORT_NOARG = new Set(['f', 'u', 'n', 'v', 'q', '4', '6']);
const LONG_OK = new Set(['--force', '--force-with-lease', '--no-force-with-lease', '--force-if-includes', '--no-force-if-includes', '--set-upstream', '--dry-run', '--verbose', '--quiet',
  '--progress', '--thin', '--no-thin', '--no-verify', '--verify', '--atomic', '--no-atomic', '--porcelain', '--no-signed', '--ipv4', '--ipv6', '--no-follow-tags', '--no-recurse-submodules']);

/** Parses `git push` arguments (after `push`). Throws Refuse for anything that can write other than named branches. */
export function parsePushArgs(args) {
  let remote = null; const refspecs = []; let positional = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!positional && a === '--') { positional = true; continue; }
    if (!positional && a.startsWith('--')) {
      const [name, value] = [a.split('=')[0], a.includes('=') ? a.slice(a.indexOf('=') + 1) : null];
      if (name === '--push-option') { if (value === null) i++; continue; }
      if (name === '--force-with-lease' || name === '--signed') continue;
      if (name === '--recurse-submodules') { if (value === 'no' || value === 'check') continue; no('recurse'); }
      if (LONG_OK.has(a)) continue;
      no(`option ${name}`);
    } else if (!positional && a.startsWith('-') && a.length > 1) {
      for (let k = 1; k < a.length; k++) {
        if (a[k] === 'o') { if (k === a.length - 1) i++; break; }
        if (!SHORT_NOARG.has(a[k])) no(`option -${a[k]}`);
      }
    } else if (remote === null) remote = a;
    else refspecs.push(a);
  }
  return { remote, refspecs };
}

const truthy = v => v === undefined ? false : ['true', 'yes', 'on', '1', ''].includes(String(v).toLowerCase());
/** Parses `git config --list -z` into {get(key), all(key)} (last value wins for get). */
export function parseConfig(text) {
  const map = new Map();
  for (const entry of String(text).split('\0')) {
    if (!entry) continue; const nl = entry.indexOf('\n'); const rawKey = nl < 0 ? entry : entry.slice(0, nl); const value = nl < 0 ? '' : entry.slice(nl + 1);
    const first = rawKey.indexOf('.'), last = rawKey.lastIndexOf('.');
    const key = first === last ? rawKey.toLowerCase() : `${rawKey.slice(0, first).toLowerCase()}${rawKey.slice(first, last)}.${rawKey.slice(last + 1).toLowerCase()}`;
    (map.get(key) ?? map.set(key, []).get(key)).push(value);
  }
  return { all: k => map.get(k) ?? [], get: k => map.get(k)?.at(-1) };
}
const SAFE_NAME = /^[A-Za-z0-9._/-]+$/;
const SAFE_SRC = /^[A-Za-z0-9._/][A-Za-z0-9._/-]*$/;
const asHeads = ref => (ref && ref.startsWith('refs/heads/') ? ref : null);

/**
 * Destination refs for a push. `local` answers `currentBranch()` (refs/heads/x or null) and `symbolic(name)` (full ref or null);
 * `cfg` is parseConfig output. Returns an array of refs/heads/* strings or throws Refuse.
 */
export async function deriveRefs({ remote, refspecs, cfg, local }) {
  const current = await local.currentBranch();
  const branch = current ? current.slice('refs/heads/'.length) : null;
  const upstreamRemote = (branch && cfg.get(`branch.${branch}.remote`)) || 'origin';
  const R = remote ?? (branch && cfg.get(`branch.${branch}.pushremote`)) ?? cfg.get('remote.pushdefault') ?? upstreamRemote;
  if (!SAFE_NAME.test(R) && !/^https:\/\/github\.com\//.test(R)) no('remote');
  const named = /^[A-Za-z0-9._-]+$/.test(R);
  if (named && truthy(cfg.get(`remote.${R}.mirror`))) no('mirror remote');
  if (truthy(cfg.get('push.followtags'))) no('followTags');
  const submodules = cfg.get('push.recursesubmodules'); if (submodules && !['no', 'check', 'false'].includes(submodules)) no('recurse config');

  const fromSpecs = async specs => { const out = []; for (const spec of specs) out.push(await oneRefspec(spec, local)); return out; };
  let refs;
  if (refspecs.length) refs = await fromSpecs(refspecs);
  else {
    const configured = named ? cfg.all(`remote.${R}.push`) : [];
    if (configured.length) refs = await fromSpecs(configured);
    else {
      if (!current) no('detached');
      const mode = (cfg.get('push.default') ?? 'simple').toLowerCase();
      const merge = cfg.get(`branch.${branch}.merge`);
      const triangular = R !== upstreamRemote;
      if (mode === 'current' || (mode === 'simple' && triangular)) refs = [current];
      else if (mode === 'upstream' || mode === 'tracking' || mode === 'simple') {
        if (triangular || !merge || !cfg.get(`branch.${branch}.remote`)) no('no upstream');
        if (mode === 'simple' && merge !== current) no('simple mismatch');
        refs = [merge];
      } else no(`push.default ${mode}`);
    }
  }
  refs = [...new Set(refs)];
  if (!refs.length || refs.length > MAX_REFS) no('ref count');
  for (const ref of refs) if (!isAllowedPushRef(ref)) no('ref not allowed');
  return refs;
}
async function oneRefspec(spec, local) {
  if (spec === 'tag') no('tag');
  let s = spec.startsWith('+') ? spec.slice(1) : spec;
  if (!s || s === ':' || s.includes('*') || s.includes('\\') || /\s/.test(s)) no('refspec');
  const colon = s.indexOf(':');
  const src = colon < 0 ? s : s.slice(0, colon); const dst = colon < 0 ? s : s.slice(colon + 1);
  if (!src || !dst || dst.includes(':')) no('refspec');
  const srcRef = src === 'HEAD' ? await local.currentBranch() : src.startsWith('refs/') ? src : (SAFE_SRC.test(src) ? await local.symbolic(src) : null);
  if (colon < 0) { // same name on both sides
    if (src === 'HEAD') return asHeads(srcRef) ?? no('detached');
    if (src.startsWith('refs/')) return src;
    if (!asHeads(srcRef)) no('not a branch');
    return `refs/heads/${src}`;
  }
  if (dst.startsWith('refs/')) return dst;
  if (!SAFE_SRC.test(dst) || !asHeads(srcRef)) no('short destination'); // an unqualified destination is only trusted for a local branch source
  return `refs/heads/${dst}`;
}

const runGit = (dir, args, { env, ids }) => new Promise(resolve => {
  const opts = { cwd: dir, timeout: 5000, maxBuffer: 1 << 20, env: { PATH: env.PATH ?? '/usr/local/bin:/usr/bin:/bin', HOME: env.HOME, LANG: 'C', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0',
    ...(env.GIT_CONFIG_SYSTEM ? { GIT_CONFIG_SYSTEM: env.GIT_CONFIG_SYSTEM } : {}), ...(env.GIT_CONFIG_GLOBAL ? { GIT_CONFIG_GLOBAL: env.GIT_CONFIG_GLOBAL } : {}), ...(env.XDG_CONFIG_HOME ? { XDG_CONFIG_HOME: env.XDG_CONFIG_HOME } : {}) } };
  if (process.getuid?.() === 0 && ids) { opts.uid = ids.uid; opts.gid = ids.gid; } // never run git in a project-controlled repo as root
  execFile('git', args, opts, (err, stdout) => resolve(err ? null : String(stdout)));
});
const FORBIDDEN_ENV = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_NAMESPACE', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT', 'GIT_CONFIG', 'GIT_INDEX_FILE', 'GIT_CEILING_DIRECTORIES', 'GIT_EXEC_PATH'];

/** Walks up from the helper pid to the `git push` that spawned it. Returns {kind:'push',...} | {kind:'none'} | null (claim is invalid). */
export function findPush(pid, { proc = realProc, expectedUid = PROJECT_UID, helperName = /(^|\/)git-credential-vibyra$/ } = {}) {
  if (!Number.isInteger(pid) || pid <= 1) return null;
  const self = proc.cmdline(pid), ids = proc.ids(pid);
  if (!self || !ids || ids.uid !== expectedUid || !self.some(a => helperName.test(a))) return null;
  let cur = proc.ppid(pid);
  for (let depth = 0; depth < 6 && cur && cur > 1; depth++) {
    const argv = proc.cmdline(cur), who = proc.ids(cur); if (!argv || !who || who.uid !== expectedUid) return { kind: 'none' };
    if (isGit(argv)) {
      const split = splitGitArgv(argv.slice(1));
      if (split.sub === 'push' || (split.sub === null && argv.includes('push'))) return { kind: 'push', pid: cur, argv, split, ids: who };
    }
    cur = proc.ppid(cur);
  }
  return { kind: 'none' };
}

/**
 * Exact destination refs of the `git push` behind helper process `pid`, or null (refuse). `git` is injectable
 * as `(dir, args, ctx) => Promise<string|null>` for tests.
 */
export async function resolvePushRefs(pid, { proc = realProc, expectedUid = PROJECT_UID, helperName, git = runGit } = {}) {
  try {
    const found = findPush(pid, { proc, expectedUid, helperName });
    if (found?.kind !== 'push' || found.split.unsafe || found.split.sub !== 'push') return null;
    const env = proc.environ(found.pid); if (!env || FORBIDDEN_ENV.some(k => k in env)) return null;
    let dir = proc.cwd(found.pid); if (!dir) return null;
    for (const d of found.split.dirs) dir = path.resolve(dir, d);
    const { remote, refspecs } = parsePushArgs(found.split.rest);
    const ctx = { env: { ...env, PATH: process.env.PATH }, ids: found.ids };
    const listing = await git(dir, ['config', '--list', '-z'], ctx); if (listing === null) return null;
    const cfg = parseConfig(listing);
    const head = await git(dir, ['symbolic-ref', '-q', 'HEAD'], ctx); const headRef = head && /^refs\/heads\/[^\n]+\n?$/.test(head) ? head.trim() : null;
    const symbolic = async name => { const r = await git(dir, ['rev-parse', '--symbolic-full-name', name], ctx); return r ? r.trim() : null; };
    return await deriveRefs({ remote, refspecs, cfg, local: { currentBranch: () => headRef, symbolic } });
  } catch { return null; } // Refuse or anything unexpected: fail closed
}
