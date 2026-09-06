import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const files = ['App.tsx', 'index.ts'];
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'generated') continue;
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await visit(path);
    else if (/\.(tsx?|mjs)$/.test(path)) files.push(path);
  }
}
await visit('src'); await visit('scripts'); await visit('tests');
let failed = false;
for (const path of files) {
  const count = (await readFile(resolve(path), 'utf8')).trimEnd().split('\n').length;
  if (count > 200) { console.error(`${path}: ${count} lines (maximum 200)`); failed = true; }
}
if (failed) process.exitCode = 1;
else console.log(`${files.length} source/test/script files meet the 200-line limit.`);
