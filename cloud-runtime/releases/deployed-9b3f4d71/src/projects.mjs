import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { runAsUser } from './safe-dirs.mjs';

const namePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const repoPattern = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const refPattern = /^(?!-)[A-Za-z0-9._/-]+$/;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export const validProject = p => namePattern.test(p?.name ?? '') && !p.name.endsWith('.lock') && (p.repo == null || (repoPattern.test(p.repo) && p.repo.split('/').every(s => s !== '.' && s !== '..')))
  && (p.branch == null || refPattern.test(p.branch));
/** Git settings applied to every clone, so the helper and hook guard are in force even when /etc/gitconfig is absent. */
export const gitFlags = paths => ['-c', `credential.helper=${paths.helper}`, '-c', 'credential.useHttpPath=true', '-c', `core.hooksPath=${paths.hooks}`];

function runGit(args, { cwd, env, uid, gid, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, env, stdio: 'ignore', detached: true, ...(uid != null ? { uid, gid: gid ?? uid } : {}) });
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* done */ } }, timeoutMs);
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(Error('git clone failed')); });
  });
}
/**
 * Clones one queued project into <projectsDir>/<name> as the project user. DNS may lag right after boot,
 * so a failed clone is retried on an emptied target (same policy as the legacy single-project path).
 */
export async function createProject(project, cfg) {
  if (!validProject(project)) throw Error('Invalid project');
  // /data/projects belongs to uid 1001, which can swap any entry for a symlink. Root therefore never rm/mkdir/chowns in it:
  // every write below runs as the project user (cfg.uid), with its own rights. Root only does read-only lstat/stat.
  const as = cfg.runAs ?? runAsUser; const user = { uid: cfg.uid, gid: cfg.gid ?? cfg.uid, cwd: cfg.projectsDir };
  const target = path.join(cfg.projectsDir, project.name);
  const marker = path.join(cfg.projectsDir, `.${project.name}.cloning`);
  const isDir = (await fs.lstat(target).catch(() => null))?.isDirectory() ?? false;
  const partial = await fs.lstat(marker).then(() => true, () => false);
  const complete = isDir && !partial && (!project.repo || await fs.stat(path.join(target, '.git')).then(() => true, () => false));
  if (complete) return { existed: true };
  const clean = () => as('rm', ['-rf', '--', target], user);
  if (!project.repo) { await clean(); await as('mkdir', ['-m', '755', '--', target], user); return { existed: false }; }
  const attempts = cfg.attempts ?? 4;
  for (let attempt = 1; ; attempt++) {
    try {
      // The marker outlives a crash mid-clone, so the next pass knows the folder is partial and starts clean.
      await clean(); await as('touch', ['--', marker], user); await as('mkdir', ['-m', '755', '--', target], user);
      await runGit([...gitFlags(cfg.paths), 'clone', '-q', ...(project.branch ? ['--branch', project.branch] : []), '--', cfg.urlFor(project.repo), '.'],
        { cwd: target, env: cfg.env, uid: cfg.uid, gid: cfg.gid, timeoutMs: cfg.timeoutMs ?? 600000 });
      await as('rm', ['-f', '--', marker], user);
      return { existed: false };
    } catch (error) {
      if (attempt >= attempts) { await clean().catch(() => {}); await as('rm', ['-f', '--', marker], user).catch(() => {}); throw error; }
      await sleep((cfg.retryMs ?? 3000) * attempt);
    }
  }
}
/** One pass over the queue: clone each pending project and report it done (or failed, so the phone can show why). */
export async function drainProjects(client, cfg) {
  const reply = await client.call('/projects/pending');
  for (const project of reply.projects ?? []) {
    let result;
    try { await createProject(project, cfg); result = { ok: true }; } catch (e) { result = { ok: false, error: String(e.message).slice(0, 200) }; }
    if (!project?.id) continue;
    await client.call(`/projects/${encodeURIComponent(project.id)}/done`, result).catch(() => {});
  }
}
export const githubUrl = repo => `https://github.com/${repo}.git`;
