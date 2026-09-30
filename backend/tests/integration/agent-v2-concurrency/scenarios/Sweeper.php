<?php
use App\Services\AgentRuns\Connections\LegacyInstalls;
use Illuminate\Support\Facades\DB;

/** Scenario 9: the stuck-`dispatching` sweeper after a real kill -9 of the API process in the middle of an approved write (an `approved` one is scenario 13). */
final class ConcSweeper
{
    private const SEND = ['to' => 'board@example.com', 'subject' => 'S', 'body' => 'B'];

    public static function run(): void
    {
        Conc::$scenario = '9 dispatching sweeper';
        self::killedAfterGmailGotIt();
        self::killedBeforeGmailGotIt();
        self::cancelBothWays();
        self::sweepersRacingCompleteCancelAndRetries();
        self::macWriteAfterLeaseLoss();
    }

    public static function decide(array $fx, array $a): array
    {
        return ['op' => 'call', 'method' => 'POST', 'uri' => '/api/agents/v2/actions/'.$a['id'].'/decision', 'token' => $fx['token'],
            'json' => ['fingerprint' => $a['fingerprint'], 'decision' => 'allow']];
    }

    /** An approved gmail_send whose API process is kill -9'd during the provider call (the send did or did not reach Gmail). */
    private static function strand(bool $arrives): array
    {
        $fx = ConcFixture::make(true);
        ConcFixture::admit($fx, 'Email the board.');
        $c = ConcFixture::claim($fx);
        $a = ConcFixture::write($fx, $c, self::SEND, 'send-1');
        $env = ['CONC_SEND_DELAY_MS' => '30000'] + ($arrives ? [] : ['CONC_SEND_COMMIT_AFTER_STALL' => '1']);
        $race = ConcRace::start([self::decide($fx, $a)], 0, $env)->release();
        $call = ConcWorkers::awaitInFlight($arrives ? 'GMAIL_SEND' : 'GMAIL_INFLIGHT', 'tok-'.$fx['user'], 30);
        $race->kill(0);
        $race->results(10);
        return [$fx, $c, $a, $call !== null];
    }

    private static function age(string $action): void
    {
        DB::table('agent_tool_actions')->where('id', $action)->update(['dispatched_at' => now()->subMinutes(6), 'updated_at' => now()->subMinutes(6)]);
    }

    public static function sweep(int $n = 1): array
    {
        return ConcRace::artisans($n, ['vibyra:agent-v2-sweep-dispatching']);
    }

    public static function facts(array $fx, array $c, array $a): array
    {
        return ['action' => DB::table('agent_tool_actions')->where('id', $a['id'])->value('state'), 'run' => DB::table('agent_runs')->where('id', $c['id'])->value('state'),
            'sends' => ConcFakes::count('GMAIL_SEND', 'tok-'.$fx['user']), 'lookups' => ConcFakes::count('GMAIL_LOOKUP', 'tok-'.$fx['user']),
            'receipts' => DB::table('agent_receipts')->where('action_id', $a['id'])->count(),
            'results' => DB::table('agent_run_events')->where('run_id', $c['id'])->where('type', 'tool.result')->count()];
    }

    public static function complete(array $fx, array $c): array
    {
        return ConcHttp::runner($fx, 'POST', '/runs/'.$c['id'].'/complete', ['generation' => $c['generation'], 'answer' => 'Sent.']);
    }

    private static function killedAfterGmailGotIt(): void
    {
        [$fx, $c, $a, $hit] = self::strand(true);
        $f = self::facts($fx, $c, $a);
        Conc::check('kill -9 of the API mid approved send (Gmail already has it): action dispatching, run running, one send', $hit && $f['action'] === 'dispatching' && $f['run'] === 'running' && $f['sends'] === 1, json_encode($f));
        $young = self::sweep()[0];
        Conc::check('a sweep inside dispatch_stale_minutes leaves it alone', self::facts($fx, $c, $a)['action'] === 'dispatching' && str_contains($young['out'], 'confirmed=0 unknown=0 failed=0'), $young['out']);
        self::age($a['id']);
        $out = self::sweep()[0];
        $f = self::facts($fx, $c, $a);
        Conc::check('…after the window the sweeper finds the Message-ID at Gmail and CONFIRMS it (completed, receipt confirmed); the write is never re-sent (1 send, 1 lookup)',
            $f['action'] === 'completed' && $f['sends'] === 1 && $f['lookups'] === 1 && $f['receipts'] === 1 && $f['results'] === 1 && str_contains($out['out'], 'confirmed=1'), json_encode($f).' '.$out['out']);
        $done = self::complete($fx, $c);
        self::sweep(2);
        $after = self::facts($fx, $c, $a);
        Conc::check('…runner /complete now succeeds and the run ends completed; two more sweeps change nothing (idempotent)', $done['status'] === 200 && $after['run'] === 'completed' && $after['results'] === 1 && $after['lookups'] === 1 && $after['sends'] === 1, 'complete='.$done['status'].' '.json_encode($after));
    }

    private static function killedBeforeGmailGotIt(): void
    {
        [$fx, $c, $a, $hit] = self::strand(false);
        $f = self::facts($fx, $c, $a);
        Conc::check('kill -9 of the API mid approved send (Gmail never got it): action dispatching, run running, zero sends', $hit && $f['action'] === 'dispatching' && $f['sends'] === 0, json_encode($f));
        $refused = self::complete($fx, $c);
        self::age($a['id']);
        self::sweep();
        $f = self::facts($fx, $c, $a);
        $receipt = DB::table('agent_receipts')->where('action_id', $a['id'])->first();
        Conc::check('…the lookup finds nothing, so the action is UNKNOWN with an outcome_unknown receipt; still zero sends (a write is never re-dispatched)',
            $refused['status'] === 409 && $f['action'] === 'unknown' && $f['sends'] === 0 && $f['lookups'] === 1 && ($receipt->outcome ?? '') === 'outcome_unknown' && $f['results'] === 1, 'complete-before='.$refused['status'].' '.json_encode($f));
        $done = self::complete($fx, $c);
        $run = DB::table('agent_runs')->find($c['id']);
        Conc::check('…runner /complete is no longer refused and the run ends outcome_unknown with one run.outcome_unknown event', $done['status'] === 200 && $run->state === 'outcome_unknown'
            && DB::table('agent_run_events')->where('run_id', $c['id'])->where('type', 'run.outcome_unknown')->count() === 1, 'complete='.$done['status'].' run='.$run->state);
    }

    private static function cancelBothWays(): void
    {
        [$fx, $c, $a] = self::strand(false);
        self::age($a['id']);
        self::sweep();
        $r = ConcHttp::call('POST', '/api/agents/v2/runs/'.$c['id'].'/cancel', $fx['token']);
        $f = self::facts($fx, $c, $a);
        Conc::check('sweep then cancel: the run ends cancelled with the action shown unknown', $r['status'] === 200 && $f['run'] === 'cancelled' && $f['action'] === 'unknown', json_encode($f));
        [$fx, $c, $a] = self::strand(false);
        ConcHttp::call('POST', '/api/agents/v2/runs/'.$c['id'].'/cancel', $fx['token']);
        $mid = self::facts($fx, $c, $a)['action'];
        self::age($a['id']);
        self::sweep();
        $f = self::facts($fx, $c, $a);
        Conc::check('cancel then sweep: the run stays cancelled and the stranded write is still closed as unknown (never sent)', $mid === 'dispatching' && $f['run'] === 'cancelled' && $f['action'] === 'unknown' && $f['sends'] === 0, 'before sweep='.$mid.' '.json_encode($f));
    }

    /** Four sweepers, the runner's /complete, the person's cancel and two retried approvals, all released at once on a stranded write. */
    private static function sweepersRacingCompleteCancelAndRetries(): void
    {
        $bad = []; $ends = []; $lookups = 0; $deadlocks0 = ConcPg::count('deadlock detected'); $codes = [];
        foreach (range(0, 5) as $i) {
            [$fx, $c, $a] = self::strand(false);
            self::age($a['id']);
            $jobs = [['op' => 'sweep'], ['op' => 'sweep'], ['op' => 'sweep'], ['op' => 'sweep'], self::decide($fx, $a), self::decide($fx, $a),
                ['op' => 'runner', 'fx' => $fx, 'method' => 'POST', 'suffix' => '/runs/'.$c['id'].'/complete', 'json' => ['generation' => $c['generation'], 'answer' => 'Sent.'], 'jitterMs' => $i % 3],
                ['op' => 'call', 'method' => 'POST', 'uri' => '/api/agents/v2/runs/'.$c['id'].'/cancel', 'token' => $fx['token'], 'jitterMs' => ($i + 1) % 3]];
            $race = ConcRace::run($jobs);
            foreach (Conc::tally(array_slice($race, 4)) as $k => $n) $codes[$k] = ($codes[$k] ?? 0) + $n;
            $f = self::facts($fx, $c, $a);
            $lookups += $f['lookups'];
            $ends[$f['run']] = ($ends[$f['run']] ?? 0) + 1;
            if ($f['action'] !== 'unknown' || $f['sends'] !== 0 || $f['lookups'] !== 1 || $f['results'] !== 1 || $f['receipts'] !== 1 || !in_array($f['run'], ['cancelled', 'outcome_unknown'], true)) $bad[] = 'round '.$i.' '.json_encode($f);
        }
        ksort($codes);
        Conc::check('6 rounds of 4 concurrent sweeps + /complete + cancel + 2 retried approvals on a stranded write: always one unknown action, one receipt, one tool.result, exactly one provider lookup, zero sends, run cancelled or outcome_unknown',
            !$bad, 'run ends '.json_encode($ends).'; lookups in total '.$lookups.'; HTTP '.Conc::fmt($codes).($bad ? ' BAD: '.implode('; ', $bad) : ''));
        $deadlocks = ConcPg::count('deadlock detected') - $deadlocks0;
        Conc::check('…no deadlock and no 5xx between the sweeper, /complete, cancel and approvals (run → action lock order)', $deadlocks === 0 && !array_intersect_key($codes, array_flip(['500', '503', 'crash'])), 'deadlocks='.$deadlocks);
    }

    /** A Mac-claimed write: swept only once the run's lease lapsed; the next runner then finishes the run as outcome_unknown. */
    private static function macWriteAfterLeaseLoss(): void
    {
        $fx = ConcFixture::workspace(ConcFixture::make(false));
        LegacyInstalls::sync($fx['user']);
        $conn = (string) DB::table('agent_connections')->where('workspace_id', $fx['workspace'])->value('id');
        ConcFixture::admit($fx, 'Fix notes.');
        $c = ConcFixture::claim($fx);
        $a = ConcHttp::runner($fx, 'POST', '/runs/'.$c['id'].'/tools', ['generation' => $c['generation'], 'callId' => 'e1', 'tool' => 'workspace_edit', 'connectionId' => $conn,
            'schemaRevision' => app(App\Services\AgentRuns\Tools\ToolCatalog::class)->schemaRevision('workspace_edit'),
            'arguments' => ['path' => 'notes.txt', 'content' => "fixed\n", 'expectedSha256' => 'new']])['json']['action'];
        $a['fingerprint'] = DB::table('agent_tool_actions')->where('id', $a['id'])->value('fingerprint');
        ConcHttp::call('POST', '/api/agents/v2/actions/'.$a['id'].'/decision', $fx['token'], ['fingerprint' => $a['fingerprint'], 'decision' => 'allow']);
        ConcHttp::runner($fx, 'POST', '/runs/'.$c['id'].'/computer/'.$a['id'].'/claim', ['generation' => $c['generation'], 'fingerprint' => $a['fingerprint']]);
        self::age($a['id']);
        self::sweep();
        $alive = DB::table('agent_tool_actions')->where('id', $a['id'])->value('state');
        DB::table('agent_runs')->where('id', $c['id'])->update(['lease_expires_at' => now()->subSeconds(2)]);
        self::sweep();
        $row = DB::table('agent_tool_actions')->find($a['id']);
        Conc::check('Mac-claimed write: untouched while the Mac holds the lease, then swept to unknown once the lease lapsed (outcome_unknown receipt)', $alive === 'dispatching' && $row->state === 'unknown'
            && DB::table('agent_receipts')->where('action_id', $a['id'])->value('outcome') === 'outcome_unknown', 'alive='.$alive.' after='.$row->state);
        $next = ConcFixture::claim($fx);
        $done = ConcHttp::runner($fx, 'POST', '/runs/'.$c['id'].'/complete', ['generation' => $next['generation'], 'answer' => 'Stopped.']);
        Conc::check('…the next runner (generation 2) completes it and the run ends outcome_unknown', $next['generation'] === 2 && $done['status'] === 200 && DB::table('agent_runs')->where('id', $c['id'])->value('state') === 'outcome_unknown', 'complete='.$done['status']);
    }
}
