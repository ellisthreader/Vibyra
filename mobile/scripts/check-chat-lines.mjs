import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../..', import.meta.url));
const files = new Set([
  'backend/routes/vibes.php', 'backend/app/Http/Controllers/VibesController.php', 'backend/app/Jobs/RunVibesTurn.php',
  'backend/app/Services/Vibes/Catalog.php', 'backend/app/Services/Vibes/Quotes.php', 'backend/app/Services/Vibes/Wallet.php',
  'backend/app/Services/Vibes/CatalogMenu.php', 'backend/tests/Feature/VibesCatalogSnapshotTest.php',
  'backend/tests/Feature/VibesChatReadinessTest.php', 'backend/tests/Feature/VibesThrottleTest.php',
  'mobile/tests/preferencesApi.test.ts', 'mobile/tests/chatRecoveryFixture.tsx',
  'mobile/scripts/verify-chat-recovery.mjs', 'mobile/scripts/check-chat-lines.mjs',
  'mobile/tests/chatAccountLayoutFixture.tsx', 'mobile/scripts/verify-chat-account-layout.mjs',
]);
async function collect(directory, filter) {
  for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) { if (!filter) await collect(path); }
    else if (filter ? filter.test(entry.name) : /\.(tsx?|php)$/.test(entry.name)) files.add(path);
  }
}
await collect('backend/app/Services/Vibes/Auto');
await collect('backend/tests/Feature', /^VibesAuto.*\.php$/);
await collect('mobile/src/vibes');
await collect('mobile/tests', /^vibes.*\.test\.ts$/);
let failures = 0;
for (const file of files) {
  const lines = (await readFile(resolve(root, file), 'utf8')).trimEnd().split('\n').length;
  if (lines > 200) { failures++; console.error(`${file}: ${lines} lines (maximum 200)`); }
}
if (failures) process.exitCode = 1;
else console.log(`PASS: ${files.size} Chat source, test and verification files are within 200 lines. Generated/vendor/build folders excluded.`);
