import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadChunks } from '../scripts/railway-chunk-upload.mjs';

test('large release archives are appended in bounded chunks before remote verification', () => {
  const original = Buffer.alloc(9 * 1024 * 1024 + 17, 42);
  const writes = [];
  uploadChunks(original, '/app/private/releases/mac/update.tar.gz', ['--service', 'Vibyra'],
    (args, options) => writes.push({ args, input: options?.input }));
  assert.match(writes[0].args.at(-1), /mkdir -p .* && : > .*update\.tar\.gz/);
  assert.equal(writes.length, 4);
  assert.ok(writes.slice(1).every(({ input }) => input.length <= 4 * 1024 * 1024));
  assert.deepEqual(Buffer.concat(writes.slice(1).map(({ input }) => input)), original);
});
