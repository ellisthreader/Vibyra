<?php
use App\Jobs\PublishAgentV2Branch;
use App\Services\AgentRuns\Connections\LegacyInstalls;
use App\Services\AgentRuns\Tools\ToolCatalog;
use App\Services\Agents\BranchPublication\Manifest;
use Illuminate\Support\Facades\DB;

/** Scenario 11: an approved branch publish (Mac upload, then the encrypted queue job that writes to GitHub) under duplicate, racing and killed delivery. */
final class ConcPublish
{
    public static function run(): void
    {
        Conc::$scenario = '11 branch publish job';
        self::duplicateJobsOnRealWorkers();
        self::lockOrderOfTheJob();
        self::sweeperAgainstTheJob();
        self::duplicateReceiptsAgainstTheJob();
        self::workerKilledMidWrite();
    }

    private static function tool(array $fx, array $c, string $tool, string $conn, array $args, string $id): array
    {
        return ConcFixture::ok(ConcHttp::runner($fx, 'POST', '/runs/'.$c['id'].'/tools', ['generation' => $c['generation'], 'callId' => $id, 'tool' => $tool,
            'connectionId' => $conn, 'schemaRevision' => app(ToolCatalog::class)->schemaRevision($tool), 'arguments' => $args]), 200)['action'];
    }

    private static function fingerprint(string $id): string
    {
        return (string) DB::table('agent_tool_actions')->where('id', $id)->value('fingerprint');
    }

    private static function mac(array $fx, array $c, string $id, string $step, array $json): array
    {
        return ConcHttp::runner($fx, 'POST', '/runs/'.$c['id'].'/computer/'.$id.'/'.$step, ['generation' => $c['generation']] + $json);
    }

    /** A publish_branch the person approved and the Mac claimed; the Mac's upload (the receipt) is sent by the caller. */
    private static function stage(): array
    {
        $fx = ConcFixture::workspace(ConcFixture::make(false));
        LegacyInstalls::sync($fx['user']);
        $conn = (string) DB::table('agent_connections')->where('workspace_id', $fx['workspace'])->value('id');
        $gh = ConcFixture::ok(ConcHttp::call('POST', '/api/agents/v2/connections', $fx['token'], ['provider' => 'github', 'credential' => 'ghp_conc_token']), 201)['connection']['id'];
        ConcFixture::ok(ConcHttp::call('PUT', '/api/agents/v2/agents/'.$fx['agent'].'/grants/'.$gh, $fx['token'], ['operations' => ['github_read_issue']]), 200);
        ConcFixture::admit($fx, 'Publish the fix.');
        $c = ConcFixture::claim($fx);
        $files = [['path' => 'notes.txt', 'status' => ' M', 'previousPath' => null, 'sha256' => hash('sha256', "fixed\n"), 'mode' => '100644', 'bytes' => 6]];
        $branch = 'vibyra-agent/'.$fx['workspace'];
        $snapshot = ['baseSha' => ConcProviders::BASE, 'branch' => $branch, 'files' => $files, 'snapshotSha256' => Manifest::digest(ConcProviders::BASE, $branch, $files)];
        $changes = self::tool($fx, $c, 'workspace_changes', $conn, [], 'changes');
        self::mac($fx, $c, $changes['id'], 'claim', ['fingerprint' => self::fingerprint($changes['id'])]);
        ConcFixture::ok(self::mac($fx, $c, $changes['id'], 'receipt', ['result' => $snapshot]), 200);
        $publish = self::tool($fx, $c, 'publish_branch', $conn, ['repository' => 'octo/app', 'baseBranch' => 'main', 'message' => 'Fix issue #1', 'snapshotSha256' => $snapshot['snapshotSha256']], 'publish');
        $fp = self::fingerprint($publish['id']);
        ConcFixture::ok(ConcHttp::call('POST', '/api/agents/v2/actions/'.$publish['id'].'/decision', $fx['token'], ['fingerprint' => $fp, 'decision' => 'allow']), 200);
        ConcFixture::ok(self::mac($fx, $c, $publish['id'], 'claim', ['fingerprint' => $fp]), 200);
        $snapshot['files'][0]['contentBase64'] = base64_encode("fixed\n");
        return ['fx' => $fx, 'c' => $c, 'id' => $publish['id'], 'upload' => $snapshot];
    }

    /** The Mac posts its exact upload: the action becomes phase `uploaded` and one job is queued (nothing consumes the queue unless a worker runs). */
    private static function upload(array $s): array
    {
        return self::mac($s['fx'], $s['c'], $s['id'], 'receipt', ['result' => ['upload' => $s['upload']]]);
    }

    private static function facts(array $s): array
    {
        $a = DB::table('agent_tool_actions')->find($s['id']);
        return ['state' => $a->state, 'phase' => $a->phase, 'writes' => ConcFakes::count('GITHUB_REF_CREATE', 'refs/heads/'.$s['upload']['branch']),
            'receipts' => DB::table('agent_receipts')->where('action_id', $s['id'])->count(),
            'results' => DB::table('agent_run_events')->where('run_id', $s['c']['id'])->where('type', 'tool.result')->where('payload', 'like', '%'.$s['id'].'%')->count()];
    }

    private static function job(array $s, int $jitter = 0): array
    {
        return ['op' => 'publish_job', 'action' => $s['id'], 'upload' => $s['upload'], 'jitterMs' => $jitter];
    }

    private static function duplicateJobsOnRealWorkers(): void
    {
        $s = self::stage();
        self::upload($s);
        foreach (range(1, 6) as $i) PublishAgentV2Branch::dispatch($s['id'], $s['upload']);
        $queued = DB::table('jobs')->count();
        $w = new ConcWorkers;
        try {
            foreach (range(1, 3) as $i) $w->start(['CONC_PUBLISH_DELAY_MS' => '400']);
            $drained = ConcWorkers::drain(60);
        } finally { $w->stopAll(); }
        $f = self::facts($s);
        Conc::check($queued.' deliveries of one publish job on 3 real queue workers: exactly one GitHub ref write, action completed, one receipt, one tool.result, no failed job',
            $drained && $f['writes'] === 1 && $f['state'] === 'completed' && $f['receipts'] === 1 && $f['results'] === 1 && DB::table('failed_jobs')->count() === 0, json_encode($f).' queued='.$queued);
    }

    /** The job must take the run lock before the action lock like everyone else; action → run here deadlocks with any run → action path (receipt, approval, cancel, sweeper). */
    private static function lockOrderOfTheJob(): void
    {
        $s = self::stage();
        self::upload($s);
        $pdo = new PDO('pgsql:host=127.0.0.1;port='.getenv('DB_PORT').';dbname='.getenv('DB_DATABASE'), 'postgres', '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $w = new ConcWorkers; $blocked = false; $held = null;
        DB::beginTransaction();
        try {
            DB::table('agent_runs')->where('id', $s['c']['id'])->lockForUpdate()->first(); // another request holds the run, as a cancel or receipt does
            $w->start();
            for ($until = microtime(true) + 25; microtime(true) < $until && !$blocked; usleep(50000)) $blocked = (int) $pdo->query('select count(*) from pg_locks where not granted')->fetchColumn() > 0;
            if ($blocked) {
                $pdo->beginTransaction();
                try { $pdo->query("select id from agent_tool_actions where id = '".$s['id']."' for update nowait"); $held = false; }
                catch (PDOException $e) { $held = $e->getCode() === '55P03'; } // lock_not_available: the job already holds the action row
                $pdo->rollBack();
            }
        } finally { DB::rollBack(); }
        try { ConcWorkers::drain(60); } finally { $w->stopAll(); }
        $f = self::facts($s);
        Conc::check('publish job blocked on the run lock holds no lock on the action row (run → action order, NOWAIT probe on Postgres)', $blocked && $held === false, 'job blocked='.json_encode($blocked).' action row locked by the job='.json_encode($held));
        Conc::check('…once the run is released the job publishes exactly once', $f['writes'] === 1 && $f['state'] === 'completed', json_encode($f));
    }

    /** The sweeper (stranded-action window long past) and the job deliver at once: either the job wrote and completed it, or the sweeper refused first and nothing was written. */
    private static function sweeperAgainstTheJob(): void
    {
        $bad = []; $jobWon = 0; $sweeperWon = 0; $deadlocks0 = ConcPg::count('deadlock detected');
        foreach (range(0, 7) as $i) {
            $s = self::stage();
            self::upload($s);
            DB::table('agent_tool_actions')->where('id', $s['id'])->update(['updated_at' => now()->subMinutes(30)]);
            $late = [0, 6, 12, 25, 50, 80, 120, 200][$i]; // the job deliveries start up to 200 ms after the sweeps, so either side can win
            $race = ConcRace::run([['op' => 'sweep'], ['op' => 'sweep'], self::job($s, $late), self::job($s, $late)]);
            $f = self::facts($s);
            $f['writes'] === 1 ? $jobWon++ : $sweeperWon++;
            $ok = $f['receipts'] === 1 && $f['results'] === 1 && ($f['writes'] === 1 ? $f['state'] === 'completed' : ($f['writes'] === 0 && $f['state'] === 'failed'));
            if (!$ok || array_filter($race, fn ($r) => isset($r['crash']) || isset($r['result']['crash']))) $bad[] = 'round '.$i.' '.json_encode($f).' '.json_encode(Conc::$crashes);
        }
        Conc::check('8 rounds of 2 sweeps + 2 job deliveries at once on an upload: one GitHub write ⇒ completed, none ⇒ refused "nothing was written" (never both); one receipt',
            !$bad, 'job won '.$jobWon.', sweeper won '.$sweeperWon.($bad ? ' BAD: '.implode('; ', $bad) : ''));
        Conc::check('…no deadlock between the sweeper and the job', ConcPg::count('deadlock detected') === $deadlocks0, 'deadlocks='.(ConcPg::count('deadlock detected') - $deadlocks0));
        DB::table('jobs')->delete();
    }

    /** A Mac retrying its upload (duplicate receipts lock run → action) while the job reserves the write. */
    private static function duplicateReceiptsAgainstTheJob(): void
    {
        $bad = []; $codes = []; $deadlocks0 = ConcPg::count('deadlock detected');
        foreach (range(0, 7) as $i) {
            $s = self::stage();
            self::upload($s);
            $receipt = ['op' => 'runner', 'fx' => $s['fx'], 'method' => 'POST', 'suffix' => '/runs/'.$s['c']['id'].'/computer/'.$s['id'].'/receipt',
                'json' => ['generation' => $s['c']['generation'], 'result' => ['upload' => $s['upload']]], 'jitterMs' => $i % 3];
            $race = ConcRace::run([self::job($s), self::job($s, 1), $receipt, $receipt, $receipt, $receipt]);
            foreach (Conc::tally(array_slice($race, 2)) as $k => $n) $codes[$k] = ($codes[$k] ?? 0) + $n;
            $f = self::facts($s);
            if ($f['writes'] !== 1 || $f['state'] !== 'completed' || $f['receipts'] !== 1) $bad[] = 'round '.$i.' '.json_encode($f);
        }
        ksort($codes);
        Conc::check('8 rounds of 2 job deliveries + 4 duplicate Mac uploads at once: exactly one GitHub write, completed, one receipt; every upload answered 200', !$bad && $codes === ['200' => 32], Conc::fmt($codes).($bad ? ' BAD: '.implode('; ', $bad) : ''));
        Conc::check('…no deadlock between the job and duplicate receipts', ConcPg::count('deadlock detected') === $deadlocks0, 'deadlocks='.(ConcPg::count('deadlock detected') - $deadlocks0));
        DB::table('jobs')->delete();
    }

    /** kill -9 of the worker while the ref write is in flight: never written twice; the sweeper later records it as unknown and the run ends outcome_unknown. */
    private static function workerKilledMidWrite(): void
    {
        $s = self::stage();
        self::upload($s);
        $w = new ConcWorkers;
        try {
            $w->start(['DB_QUEUE_RETRY_AFTER' => '12', 'CONC_PUBLISH_DELAY_MS' => '30000']);
            $call = ConcWorkers::awaitInFlight('GITHUB_REF_CREATE', 'refs/heads/'.$s['upload']['branch'], 40);
            $call ? posix_kill($call->pid, SIGKILL) : null;
            usleep(500000);
            $f = self::facts($s);
            Conc::check('worker kill -9 during the GitHub ref write: action left dispatching in phase writing (GitHub may have it), one write so far', $call && $f['state'] === 'dispatching' && $f['phase'] === 'writing' && $f['writes'] === 1, json_encode($f));
            $w->start(['DB_QUEUE_RETRY_AFTER' => '12']);
            sleep(16);
        } finally { $w->stopAll(); }
        $f = self::facts($s);
        Conc::check('…a replacement worker does not write again (job fails MaxAttemptsExceeded): still exactly one write, still dispatching', $f['writes'] === 1 && $f['state'] === 'dispatching' && DB::table('failed_jobs')->count() >= 1, json_encode($f));
        $young = ConcRace::artisans(1, ['vibyra:agent-v2-sweep-dispatching'])[0]['out'];
        DB::table('agent_tool_actions')->where('id', $s['id'])->update(['updated_at' => now()->subMinutes(30)]);
        $out = ConcRace::artisans(1, ['vibyra:agent-v2-sweep-dispatching'])[0]['out'];
        $f = self::facts($s);
        $receipt = DB::table('agent_receipts')->where('action_id', $s['id'])->value('outcome');
        $done = ConcHttp::runner($s['fx'], 'POST', '/runs/'.$s['c']['id'].'/complete', ['generation' => $s['c']['generation'], 'answer' => 'Published.']);
        Conc::check('…the sweeper leaves it alone inside the 20-minute publish window, then marks it unknown (receipt outcome_unknown); /complete ends the run outcome_unknown; still one write',
            str_contains($young, 'unknown=0') && str_contains($out, 'unknown=1') && $f['state'] === 'unknown' && $receipt === 'outcome_unknown' && $f['writes'] === 1
            && $done['status'] === 200 && DB::table('agent_runs')->where('id', $s['c']['id'])->value('state') === 'outcome_unknown', 'young="'.$young.'" swept="'.$out.'" '.json_encode($f).' complete='.$done['status']);
    }
}
