import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Expo keeps font assets under assets/node_modules, which Railway excludes even
// with --no-gitignore. Flatten those public assets before packaging a review build.
const root = path.resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('Pass an Expo web export directory.');
await readFile(path.join(root, 'index.html'));
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]))).flat();
}
const exported = await files(root);
const prefix = path.join(root, 'assets/node_modules') + path.sep;
const replacements = [];
const targets = new Set();
for (const file of exported.filter(file => file.startsWith(prefix))) {
  const dest = path.join(root, 'assets/dependencies', path.basename(file));
  if (targets.has(dest)) throw new Error(`Duplicate exported asset: ${path.basename(file)}`);
  targets.add(dest);
  await mkdir(path.dirname(dest), { recursive: true });
  await copyFile(file, dest);
  replacements.push([path.relative(root, file).split(path.sep).join('/'), path.relative(root, dest).split(path.sep).join('/')]);
}
let html = await readFile(path.join(root, 'index.html'), 'utf8');
for (const file of exported.filter(file => file.endsWith('.js'))) {
  let body = await readFile(file, 'utf8');
  for (const [from, to] of replacements) body = body.replaceAll(from, to);
  await writeFile(file, body);
  if (/index-[a-f0-9]+\.js$/.test(file)) {
    const name = `index-${createHash('sha256').update(body).digest('hex').slice(0, 32)}.js`;
    html = html.replaceAll(path.basename(file), name);
    await rename(file, path.join(path.dirname(file), name));
  }
}
await writeFile(path.join(root, 'index.html'), html);
await rm(path.join(root, 'assets/node_modules'), { recursive: true, force: true });
console.log(`Prepared web review export; relocated ${replacements.length} dependency assets.`);
