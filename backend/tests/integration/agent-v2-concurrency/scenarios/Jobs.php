<?php
use App\Models\AgentV2\{Run, ToolAction};
use Illuminate\Support\Facades\DB;

/** Genuine independent PHP processes contend for one account's queue, slots and resource. */
final class ConcJobs
{
    public static function run(): void
    {
        Conc::$scenario = 'Stage 5 jobs'; config(['agents_v2.parallel_jobs_enabled' => true]);
        $fx = self::fixture();
        $requests = [];
        foreach (range(1, 27) as $n) $requests[] = ['op' => 'call', 'method' => 'POST', 'token' => $fx['token'],
            'uri' => '/api/agents/v2/runs', 'json' => self::body($fx, 'queue-race-'.$n)];
        $raw = ConcRace::run($requests); $tally = Conc::tally($raw);
        Conc::check('27 admissions atomically bound queue to 24 with exact explicit refusals', ($tally['201'] ?? 0) === 24
            && ($tally['429:job_queue_full'] ?? 0) === 3 && Run::where('user_id', $fx['user'])->count() === 24, json_encode($tally));
        $requests = [];
        foreach (range(0, 11) as $n) $requests[] = ['op' => 'runner', 'fx' => $fx, 'method' => 'POST',
            'suffix' => '/claim', 'json' => ['workerSlot' => $n % 3]];
        $raw = ConcRace::run($requests); $tally = Conc::tally($raw);
        Conc::check('12 simultaneous slot claims yield exactly three active leases', ($tally['200'] ?? 0) === 3
            && ($tally['204'] ?? 0) === 9 && Run::where('user_id', $fx['user'])->where('lease_expires_at', '>', now())->count() === 3, json_encode($tally));
        $claimed = array_values(array_map(fn ($r) => $r['result']['json']['run'], array_filter($raw, fn ($r) => ($r['result']['status'] ?? null) === 200)));
        $body = ['to' => 'synthetic@example.com', 'subject' => 'Synthetic concurrent approval', 'body' => 'Harness data only.'];
        $a = ConcFixture::write($fx, $claimed[0], $body, 'write-a'); $b = ConcFixture::write($fx, $claimed[1], $body, 'write-b');
        $requests = array_map(fn ($action) => ['op' => 'call', 'method' => 'POST', 'token' => $fx['token'],
            'uri' => '/api/agents/v2/actions/'.$action['id'].'/decision',
            'json' => ['fingerprint' => $action['fingerprint'], 'decision' => 'allow']], [$a, $b, $a, $b]);
        $raw = ConcRace::run($requests); $tally = Conc::tally($raw);
        $states = ToolAction::whereIn('id', [$a['id'], $b['id']])->pluck('state')->sort()->values()->all();
        Conc::check('simultaneous duplicate approvals dispatch one write and refuse stale competing job', ($tally['200'] ?? 0) === 4
            && $states === ['completed', 'refused'], json_encode(['responses' => $tally, 'states' => $states]));
        $run = $claimed[2];
        $raw = ConcRace::run([
            ['op' => 'call', 'method' => 'POST', 'token' => $fx['token'], 'uri' => '/api/agents/v2/runs/'.$run['id'].'/cancel'],
            ['op' => 'runner', 'fx' => $fx, 'method' => 'POST', 'suffix' => '/runs/'.$run['id'].'/heartbeat', 'json' => ['generation' => $run['generation']]],
            ['op' => 'runner', 'fx' => $fx, 'method' => 'POST', 'suffix' => '/claim', 'json' => ['workerSlot' => 2]],
        ]); $tally = Conc::tally($raw);
        Conc::check('cancellation and replacement claim do not deadlock or exceed account capacity', !isset($tally['500']) && !isset($tally['crash'])
            && Run::find($run['id'])->state === 'cancelled'
            && Run::where('user_id', $fx['user'])->whereNotIn('state', \App\Services\AgentRuns\RunStates::TERMINAL)->where('lease_expires_at', '>', now())->count() <= 3, json_encode($tally));
    }
    private static function fixture(): array
    {
        $fx = ConcFixture::make();
        $fx['runtime'] = ConcFixture::ok(ConcHttp::call('POST', '/api/agents/v2/runtimes', $fx['token'], ['hostId' => $fx['hostId'],
            'provider' => 'claude', 'accountRef' => 'parallel-account', 'model' => 'sonnet', 'effort' => 'medium',
            'capabilities' => ['controlledTools' => true, 'pinnedSkillsV1' => true, 'parallelJobsV1' => true, 'workerSlots' => 3]]), 201)['runtime'];
        return $fx;
    }
    private static function body(array $fx, string $key): array
    {
        return ['agentId' => $fx['agent'], 'idempotencyKey' => $key, 'prompt' => 'Review synthetic data.', 'executionMode' => 'independent'];
    }
}
