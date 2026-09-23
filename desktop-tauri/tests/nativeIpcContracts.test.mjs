import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function sources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sources(file) : /\.tsx?$/.test(entry.name) ? [file] : [];
  });
}

test('the desktop native registry implements every literal frontend command', () => {
  const registry = fs.readFileSync(path.join(root, 'src-tauri/src/commands/registry.rs'), 'utf8');
  const handlers = registry.slice(registry.indexOf('tauri::generate_handler!['));
  const registered = new Set([...handlers.matchAll(/\b\w+::(\w+),/g)].map(match => match[1]));
  const missing = [];
  const commands = new Set();
  for (const file of sources(path.join(root, 'src'))) {
    const source = fs.readFileSync(file, 'utf8');
    // Also check the two serialized voice/speech wrappers at their call sites.
    const pattern = /\b(?:invoke|voiceAction|queue)\s*(?:<[^;]*?>\s*)?\(\s*(['"])([a-z][a-z0-9_]+)\1/g;
    for (const match of source.matchAll(pattern)) {
      const command = match[2];
      commands.add(command);
      if (!registered.has(command)) missing.push(`${path.relative(root, file)}: ${command}`);
    }
  }
  assert.ok(commands.size > 100, 'The frontend command scan must cover the application.');
  assert.deepEqual(missing, [], 'A desktop feature calls an unregistered native command.');
});
