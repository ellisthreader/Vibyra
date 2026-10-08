import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { openBuffer } from './sync-crypto.mjs';
import { CLAUDE_TOKEN_NAME, readLoginTar } from './sync-login-tar.mjs';

// Vibyra Cloud keeps its OWN sign-ins (owner decision 2026-10-07, docs/cloud-sync-contract.md "Logins"). The Mac makes a
// fresh login only for Cloud when the person clicks Allow (`origin: 'cloud'`): Codex's `auth.json` from a private
// CODEX_HOME, Claude's long-lived token from `claude setup-token`. Those are installed here. A copy of the Mac's own Codex
// login (no origin) shares one rotating refresh token with the Mac, so it is acknowledged and dropped, never fetched.
// Runs in the uid-1001 sync worker. Plaintext lives only in memory and in the final file; every failure is a fixed string.
export const LOGIN_STATE = '_login-codex';
export const CLAUDE_STATE = '_login-claude';
export const MAX_SEALED_BYTES = 256 * 1024;
const err = (code, message) => Object.assign(Error(message ?? code), { syncCode: code });
const GENERIC = { sha_mismatch: 'sealed login hash mismatch', decrypt_failed: 'could not open the login', invalid_login_archive: 'invalid login archive',
  invalid_login: 'invalid login file', write_failed: 'could not write the login', too_large: 'login too large' };
const CLAUDE_TOKEN = /^sk-ant-oat01-[A-Za-z0-9_-]{20,1000}$/;

/** Downloads the sealed blob to a scratch file, checks size and sha256, opens it in memory. Returns the plaintext tar buffer. */
async function openSealed(ctx, item) {
  if (Number(item.bytes) > MAX_SEALED_BYTES) throw err('too_large');
  await fs.mkdir(ctx.paths.tmp, { recursive: true, mode: 0o700 });
  const sealed = path.join(ctx.paths.tmp, `login-${crypto.randomBytes(8).toString('hex')}.sealed`);
  try {
    const got = await ctx.client.download(item.id, sealed);
    if (got.bytes > MAX_SEALED_BYTES) throw err('too_large');
    if (item.sha256 && got.sha256 !== String(item.sha256).toLowerCase()) throw err('sha_mismatch');
    try { return await openBuffer(ctx.key.secretHex, await fs.readFile(sealed)); } catch { throw err('decrypt_failed'); }
  } finally { await fs.rm(sealed, { force: true }); }
}

/** A JSON object, or null. The parser's own message quotes the input, so it is dropped. */
const jsonObject = buf => { try { const v = JSON.parse(buf.toString('utf8')); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; } };

/** A directory under $HOME this worker may write in: created 0700, never a symlink or a file. */
async function ownDir(dir) {
  const st = await fs.lstat(dir).catch(() => null);
  if (st && !st.isDirectory()) throw err('write_failed');
  if (!st) await fs.mkdir(dir, { mode: 0o700 });
}

/** Temp file in the same directory, mode 0600, fsync, rename: replaces a planted symlink itself, never follows it. */
async function writeAtomic(file, data) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  try {
    const fh = await fs.open(tmp, 'wx', 0o600);
    try { await fh.writeFile(data); await fh.chmod(0o600); await fh.sync(); } finally { await fh.close(); }
    await fs.rename(tmp, file);
  } catch (e) { await fs.rm(tmp, { force: true }); throw e.syncCode ? e : err('write_failed'); }
}

/** Missing files start empty; existing settings must be readable objects. Never discard permission rules or hooks. */
async function readObject(file) {
  const st = await fs.lstat(file).catch(e => { if (e.code === 'ENOENT') return null; throw err('write_failed'); });
  if (!st) return {};
  if (!st.isFile() || st.size > 4 * 1024 * 1024) throw err('write_failed');
  const value = jsonObject(await fs.readFile(file).catch(() => { throw err('write_failed'); }));
  if (!value) throw err('write_failed');
  return value;
}

async function installCodex(ctx, tar) {
  const login = readLoginTar(tar); if (!jsonObject(login)) throw err('invalid_login');
  const dir = path.join(ctx.paths.home, '.codex'); await ownDir(dir);
  await writeAtomic(path.join(dir, 'auth.json'), login);
}

/** Claude reads `env` from ~/.claude/settings.json itself (the Host strips the variable from every launch, the CLI does not),
 *  so terminals and chats both use the token. ~/.claude.json gets `hasCompletedOnboarding`, or a terminal opens on the theme picker. */
async function installClaude(ctx, tar) {
  const token = readLoginTar(tar, CLAUDE_TOKEN_NAME).toString('utf8').trim(); if (!CLAUDE_TOKEN.test(token)) throw err('invalid_login');
  const dir = path.join(ctx.paths.home, '.claude'); await ownDir(dir);
  const settingsFile = path.join(dir, 'settings.json'); const settings = await readObject(settingsFile);
  const stateFile = path.join(ctx.paths.home, '.claude.json'); const state = await readObject(stateFile);
  const env = settings.env && typeof settings.env === 'object' && !Array.isArray(settings.env) ? settings.env : {};
  await writeAtomic(settingsFile, JSON.stringify({ ...settings, env: { ...env, CLAUDE_CODE_OAUTH_TOKEN: token } }, null, 2));
  if (state.hasCompletedOnboarding !== true) await writeAtomic(stateFile, JSON.stringify({ ...state, hasCompletedOnboarding: true }, null, 2));
}

/** Handles one pending `kind:'login'` item. Never throws; the result is the body for POST blobs/{id}/applied. */
export async function applyLogin(ctx, item) {
  try {
    const name = item.provider === 'codex' ? LOGIN_STATE : item.provider === 'claude' ? CLAUDE_STATE : null;
    if (!name || item.project != null) return { ok: false, error: 'unsupported login' };
    const seq = Number(item.seq); const last = Number((await ctx.state.get(name)).seq ?? 0);
    if (!Number.isSafeInteger(seq) || seq < 1) return { ok: false, error: 'bad item' };
    // A report that never reached the backend is re-delivered: answer from the record, touch nothing.
    if (seq <= last) return { ok: true };
    if (item.origin !== 'cloud') {
      if (item.provider !== 'codex') return { ok: false, error: 'unsupported login' };
      await ctx.state.set(name, { seq, dropped: true }); return { ok: true };
    }
    const tar = await openSealed(ctx, item);
    await (item.provider === 'codex' ? installCodex(ctx, tar) : installClaude(ctx, tar));
    await ctx.state.set(name, { seq, cloud: true });
    return { ok: true };
  } catch (e) { return { ok: false, error: GENERIC[e.syncCode] ?? 'could not apply the login' }; }
}

/**
 * Once per Cloud disk: a Codex login that an older image copied in from the Mac (the record shows a carried seq and
 * nothing newer) is removed from this machine only. Removing the file revokes nothing, so the Mac stays signed in.
 * A symlink is removed itself, never followed. Returns whether a copy was removed.
 */
export async function forgetCopiedLogin(ctx) {
  try {
    const st = await ctx.state.get(LOGIN_STATE);
    if (!(Number(st.seq) > 0) || st.forgotten || st.dropped || st.cloud) return false;
    const file = path.join(ctx.paths.home, '.codex', 'auth.json');
    const dir = await fs.lstat(path.dirname(file)).catch(() => null);
    const found = dir?.isDirectory() ? await fs.lstat(file).catch(() => null) : null;
    if (found && (found.isFile() || found.isSymbolicLink())) await fs.rm(file, { force: true });
    await ctx.state.set(LOGIN_STATE, { forgotten: true });
    return !!found;
  } catch { return false; }
}
