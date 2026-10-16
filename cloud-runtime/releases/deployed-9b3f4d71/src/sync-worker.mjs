// Entry point of the uid-1001 sync worker: `node sync-worker.mjs serve` (drain loop + return snapshots) or `final <budgetMs>`
// (one last return pass during graceful stop). Config arrives as JSON in VIBYRA_SYNC_CFG; the runtime token is read from its
// file on every call (uid 1001 can read that file by design). Prints `drained` once the first drain attempt is over.
import fs from 'node:fs';
import { SyncClient } from './sync-client.mjs';
import { createSyncEngine, FINAL_BUDGET_MS, APPLY_GRACE_MS } from './sync-loop.mjs';

const cfg = JSON.parse(process.env.VIBYRA_SYNC_CFG ?? '{}');
const client = new SyncClient(cfg.origin, cfg.workspace, () => fs.readFileSync(cfg.tokenFile, 'utf8').trim());
const engine = createSyncEngine({ client, paths: cfg.paths, log: (...a) => console.error('[sync]', ...a) });
// SIGTERM while serving: let the item being applied finish (bounded), then leave. The final pass has nothing to finish.
let stopping = false; process.on('SIGTERM', () => {
  if (stopping || process.argv[2] === 'final') process.exit(0); stopping = true;
  engine.settle(APPLY_GRACE_MS).finally(() => process.exit(0));
});
if (process.argv[2] === 'final') {
  const budget = Number(process.argv[3]) || FINAL_BUDGET_MS; setTimeout(() => process.exit(0), budget + 200).unref();
  const out = await engine.finalPass(budget).catch(() => []); console.log(JSON.stringify(out.map(([n, r]) => [n, r.sent ?? false]))); process.exit(0);
}
await engine.run({ isStopping: () => stopping, onDrained: () => console.log('drained') });
