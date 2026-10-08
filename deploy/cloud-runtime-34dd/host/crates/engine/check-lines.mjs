import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const sources = [];
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (entry.name.endsWith('.rs')) sources.push(path);
  }
}
await collect(join(root, 'src'));
await collect(join(root, 'tests'));
let largest = 0;
const failures = [];
for (const path of sources) {
  const source = await readFile(path, 'utf8');
  const parts = source.split(/\r\n|\r|\n/);
  const lines = source ? parts.length - (parts.at(-1) === '' ? 1 : 0) : 0;
  largest = Math.max(largest, lines);
  if (lines > 200) failures.push(`${relative(root, path)}: ${lines} lines`);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Engine source gate: ${sources.length} Rust source/test files, largest ${largest}, all <=200 lines.`);
}
