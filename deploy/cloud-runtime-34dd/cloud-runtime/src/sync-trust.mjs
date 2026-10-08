import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * A project that arrives by sync is the owner's own folder, so the agents should open it without the first-run questions
 * ("Do you trust the files in this folder?"). This marks /data/projects/<name> as trusted in the project user's own agent
 * configs: Claude's `~/.claude.json` (`projects[path].hasTrustDialogAccepted`) and Codex's `~/.codex/config.toml`
 * (`[projects."<path>"] trust_level = "trusted"`). It runs inside the uid-1001 sync worker, never touches credentials,
 * keeps every other setting, writes through a temp file + rename, and never fails the sync: errors are swallowed.
 */
const MAX_CONFIG_BYTES = 8 * 1024 * 1024;

async function readSmall(file) {
  const st = await fs.lstat(file).catch(() => null);
  if (!st) return '';
  if (!st.isFile() || st.size > MAX_CONFIG_BYTES) return null; // a symlink or something odd: leave it alone
  return fs.readFile(file, 'utf8');
}
async function writeAtomic(file, text, mode) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.vibyra-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, text, { mode, flag: 'wx' });
  await fs.rename(tmp, file);
}

export async function trustClaude(home, dir) {
  const file = path.join(home, '.claude.json');
  const text = await readSmall(file); if (text === null) return false;
  let config = {};
  if (text.trim()) { try { config = JSON.parse(text); } catch { return false; } }
  if (!config || typeof config !== 'object' || Array.isArray(config)) return false;
  const projects = config.projects && typeof config.projects === 'object' && !Array.isArray(config.projects) ? config.projects : {};
  const entry = projects[dir] && typeof projects[dir] === 'object' ? projects[dir] : {};
  if (entry.hasTrustDialogAccepted === true) return false;
  config.projects = { ...projects, [dir]: { ...entry, hasTrustDialogAccepted: true } };
  await writeAtomic(file, JSON.stringify(config, null, 2), 0o600);
  return true;
}

const tomlKey = dir => `[projects."${dir.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
export async function trustCodex(home, dir) {
  const file = path.join(home, '.codex', 'config.toml');
  const text = await readSmall(file); if (text === null) return false;
  const header = tomlKey(dir);
  if (text.split('\n').some(line => line.trim() === header)) return false; // already has a section for it: the owner's choice stands
  const next = `${text}${text && !text.endsWith('\n') ? '\n' : ''}${text ? '\n' : ''}${header}\ntrust_level = "trusted"\n`;
  await writeAtomic(file, next, 0o600);
  return true;
}

/** Marks one synced project folder trusted for both agents. Never throws. */
export async function trustProject(home, projectsDir, name) {
  const dir = path.join(projectsDir, name);
  await trustClaude(home, dir).catch(() => false);
  await trustCodex(home, dir).catch(() => false);
}
