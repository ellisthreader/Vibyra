<?php
use App\Services\AgentRuns\Connections\LegacyInstalls;
use Illuminate\Support\Facades\DB;

/**
 * Scenario 13: an `approved` action stranded by a crash between the approval commit and the dispatch claim. The API process is
 * kill -9'd at exactly that gap (a harness-only kill point armed by an environment variable, KillPoints.php; nothing in app code),
 * then the real `php artisan vibyra:agent-v2-sweep-dispatching` processes run. `dispatched_at` (the claim marker) stays NULL.
 */
final class ConcStranded
{
    private const SEND = ['to' => 'board@example.com', 'subject' => 'S', 'body' => 'B'];

    public static function run(): void
    {
        Conc::$scenario = '13 stranded approval';
        self::killedBetweenCommitAndClaim();
        self::revokedWhileStranded();
        self::sweepersRacingLateRetriesAndComplete();
        self::cancelRacingTheSweeper();
        self::macActionBeforeAndAfterLeaseLoss();
    }

    /** A gmail_send approved by a child that is kill -9'd the instant the approval commits. @return array{0: array, 1: array, 2: array, 3: bool} true when it died there */
    private static function strand(): array
    {
        $fx = ConcFixture::make(true);
        ConcFixture::admit($fx, 'Email the board.');
        $c = ConcFixture::claim($fx);
        $a = ConcFixture::write($fx, $c, self::SEND, 'send-1');
        $r = ConcRace::start([ConcSweeper::decide($fx, $a)], 0, ['CONC_KILL_BEFORE_DISPATCH' => '1'])->release()->results(30);
        return [$fx, $c, $a, isset($r[0]['killed'])];
    }

    /** Only `updated_at`: `dispatched_at` is the claim marker and must stay NULL. */
    private static function age(string $action): void
    {
        DB::table('agent_tool_actions')->where('id', $action)->update(['updated_at' => now()->subMinutes(6)]);
    }

    private static function marked(string $action): bool
    {
        return DB::table('agent_tool_actions')->where('id', $action)->value('dispatched_at') !== null;
    }

    private static function retry(array $fx, array $a): array
    {
        return ConcHttp::call('POST', '/api/agents/v2/actions/'.$a['id'].'/decision', $fx['token'], ['fingerprint' => $a['fingerprint'], 'decision' => 'allow']);
    }

    private static function killedBetweenCommitAndClaim(): void
    {
        [$fx, $c, $a, $died] = self::strand();
        $f = ConcSweeper::facts($fx, $c, $a);
        $decided = DB::table('agent_run_events')->where('run_id', $c['id'])->where('type', 'approval.decided')->count();
        Conc::check('kill -9 of the API between the approval commit and the dispatch claim: approved, one approval.decided, run running, no claim marker, zero sends',
            $died && $f['action'] === 'approved' && $f['run'] === 'running' && $decided === 1 && !self::marked($a['id']) && $f['sends'] === 0, 'died='.json_encode($died).' '.json_encode($f));
        $retry = self::retry($fx, $a);
        $blocked = ConcSweeper::complete($fx, $c);
        $young = ConcSweeper::sweep()[0];
        $f = ConcSweeper::facts($fx, $c, $a);
        Conc::check('…a retried approval is a no-op (200), /complete is 409 actions_open, a sweep inside dispatch_stale_minutes leaves it (dispatched=0): still approved, zero sends',
            $retry['status'] === 200 && $blocked['status'] === 409 && $f['action'] === 'approved' && $f['sends'] === 0 && str_contains($young['out'], 'dispatched=0'), $retry['status'].'/'.$blocked['status'].' '.$young['out'].' '.json_encode($f));
        self::age($a['id']);
        $out = ConcSweeper::sweep()[0];
        $f = ConcSweeper::facts($fx, $c, $a);
        Conc::check('…after the window the real sweeper dispatches it through Approvals::dispatch: completed, exactly one send (no lookup), one confirmed receipt, one tool.result, claim marker now set',
            $f['action'] === 'completed' && $f['sends'] === 1 && $f['lookups'] === 0 && $f['receipts'] === 1 && $f['results'] === 1 && self::marked($a['id']) && str_contains($out['out'], 'dispatched=1'), $out['out'].' '.json_encode($f));
        $done = ConcSweeper::complete($fx, $c);
        ConcSweeper::sweep(2);
        self::retry($fx, $a);
        self::retry($fx, $a);
        $after = ConcSweeper::facts($fx, $c, $a);
        Conc::check('…runner /complete now succeeds (run completed); two more sweeps and two more approval retries change nothing (still one send, one receipt, one tool.result)',
            $done['status'] === 200 && $after['run'] === 'completed' && $after['sends'] === 1 && $after['receipts'] === 1 && $after['results'] === 1, 'complete='.$done['status'].' '.json_encode($after));
    }

    /** The person edited the grant, or disconnected the account, while the approved action was stranded: not sent, refused with a receipt, run unblocked. */
    private static function revokedWhileStranded(): void
    {
        $bad = [];
        $variants = ['grant edited' => fn ($fx) => ConcHttp::call('PUT', '/api/agents/v2/agents/'.$fx['agent'].'/grants/'.$fx['gmail'], $fx['token'], ['operations' => ['gmail_read']]),
            'connection revoked' => fn ($fx) => ConcHttp::call('DELETE', '/api/agents/v2/connections/'.$fx['gmail'], $fx['token'])];
        foreach ($variants as $label => $revoke) {
            [$fx, $c, $a, $died] = self::strand();
            $revoke($fx);
            self::age($a['id']);
            $out = ConcSweeper::sweep()[0];
            $f = ConcSweeper::facts($fx, $c, $a);
            $receipt = DB::table('agent_receipts')->where('action_id', $a['id'])->first();
            $done = ConcSweeper::complete($fx, $c);
            if (!($died && $f['action'] === 'refused' && $f['sends'] === 0 && $f['receipts'] === 1 && ($receipt->outcome ?? '') === 'refused' && $f['results'] === 1
                && str_contains($out['out'], 'refused=1') && $done['status'] === 200 && DB::table('agent_runs')->where('id', $c['id'])->value('state') === 'completed')) $bad[] = $label.': '.$out['out'].' '.json_encode($f).' complete='.$done['status'];
        }
        Conc::check('grant edited / connection revoked while the approved action was stranded: never sent, action refused with a refused receipt and one tool.result, /complete 200, run completed', !$bad, implode('; ', $bad));
    }

    /** Four sweepers, two late approval retries and the runner's /complete (at 5 to 330 ms) released together on a stranded approval (the send is held 150 ms). */
    private static function sweepersRacingLateRetriesAndComplete(): void
    {
        $bad = []; $codes = []; $d0 = ConcPg::count('deadlock detected'); $claims = 0;
        foreach (range(0, 5) as $i) {
            [$fx, $c, $a] = self::strand();
            self::age($a['id']);
            $jobs = [['op' => 'sweep'], ['op' => 'sweep'], ['op' => 'sweep'], ['op' => 'sweep'], [...ConcSweeper::decide($fx, $a), 'jitterMs' => $i % 3], [...ConcSweeper::decide($fx, $a), 'jitterMs' => 1 + $i % 2],
                ['op' => 'runner', 'fx' => $fx, 'method' => 'POST', 'suffix' => '/runs/'.$c['id'].'/complete', 'json' => ['generation' => $c['generation'], 'answer' => 'Sent.'], 'jitterMs' => [5, 30, 100, 200, 260, 330][$i]]];
            $race = ConcRace::start($jobs, 0, ['CONC_SEND_DELAY_MS' => '150'])->release()->results();
            foreach (Conc::tally(array_slice($race, 4)) as $k => $n) $codes[$k] = ($codes[$k] ?? 0) + $n;
            $dispatched = array_sum(array_map(fn ($r) => $r['result']['stats']['dispatched'] ?? 0, array_slice($race, 0, 4)));
            $claims += $dispatched;
            if (ConcSweeper::facts($fx, $c, $a)['run'] !== 'completed') ConcSweeper::complete($fx, $c); // /complete lost the race: 409 actions_open, it succeeds now
            $f = ConcSweeper::facts($fx, $c, $a);
            if ($f['action'] !== 'completed' || $f['sends'] !== 1 || $f['lookups'] !== 0 || $f['receipts'] !== 1 || $f['results'] !== 1 || $dispatched !== 1 || $f['run'] !== 'completed') $bad[] = 'round '.$i.' dispatched='.$dispatched.' '.json_encode($f);
        }
        ksort($codes);
        Conc::check('6 rounds of 4 concurrent sweepers + 2 late approval retries + /complete on a stranded approval: exactly one sweeper claimed it, exactly one send, one receipt, one tool.result, run completed',
            !$bad, 'claims in total '.$claims.'; HTTP '.Conc::fmt($codes).($bad ? ' BAD: '.implode('; ', $bad) : ''));
        $deadlocks = ConcPg::count('deadlock detected') - $d0;
        Conc::check('…no deadlock and no 5xx between the sweeper, approvals and /complete (run → action lock order)', $deadlocks === 0 && !array_intersect_key($codes, array_flip(['500', '503', 'crash'])), 'deadlocks='.$deadlocks);
    }

    /** The person's cancel against three sweepers: never more than one send; whichever wins, the run ends cancelled. */
    private static function cancelRacingTheSweeper(): void
    {
        $bad = []; $sent = 0; $codes = []; $d0 = ConcPg::count('deadlock detected');
        foreach ([0, 3, 8, 15, 25, 40, 60, 90] as $i => $ms) { // the sweepers start up to $ms later than the cancel, so both orders occur
            [$fx, $c, $a] = self::strand();
            self::age($a['id']);
            $jobs = [['op' => 'sweep', 'jitterMs' => $ms], ['op' => 'sweep', 'jitterMs' => $ms], ['op' => 'sweep', 'jitterMs' => $ms],
                ['op' => 'call', 'method' => 'POST', 'uri' => '/api/agents/v2/runs/'.$c['id'].'/cancel', 'token' => $fx['token'], 'jitterMs' => 0]];
            $race = ConcRace::start($jobs, 0, ['CONC_SEND_DELAY_MS' => '60'])->release()->results();
            foreach (Conc::tally(array_slice($race, 3)) as $k => $n) $codes[$k] = ($codes[$k] ?? 0) + $n;
            $f = ConcSweeper::facts($fx, $c, $a);
            $f['sends'] === 1 ? $sent++ : null;
            $ok = $f['run'] === 'cancelled' && $f['sends'] <= 1 && ($f['sends'] === 1 ? ($f['action'] === 'completed' && $f['receipts'] === 1 && $f['results'] === 1) : ($f['action'] === 'cancelled' && $f['receipts'] === 0));
            if (!$ok) $bad[] = 'round '.$i.' '.json_encode($f);
        }
        ksort($codes);
        $deadlocks = ConcPg::count('deadlock detected') - $d0;
        Conc::check('8 rounds of 3 concurrent sweepers + the person\'s cancel: never more than one send; a send ⇒ action completed with one receipt, none ⇒ action cancelled; the run always ends cancelled; no deadlock, no 5xx',
            !$bad && $deadlocks === 0 && !array_intersect_key($codes, array_flip(['500', '503', 'crash'])), 'sent in '.$sent.' of 8 rounds; cancel HTTP '.Conc::fmt($codes).'; deadlocks='.$deadlocks.($bad ? ' BAD: '.implode('; ', $bad) : ''));
    }

    /** An approved Mac write: untouched inside the window and while the Mac holds the lease, then unknown once the lease lapsed; never sent from the server. */
    private static function macActionBeforeAndAfterLeaseLoss(): void
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
        $decided = self::retry($fx, $a);
        $state = fn () => DB::table('agent_tool_actions')->where('id', $a['id'])->value('state');
        $lease = fn ($at) => DB::table('agent_runs')->where('id', $c['id'])->update(['lease_expires_at' => $at]);
        $lease(now()->subSeconds(2));
        ConcSweeper::sweep();
        $inside = $state();
        self::age($a['id']);
        $lease(now()->addMinutes(10));
        ConcSweeper::sweep();
        $alive = $state();
        $lease(now()->subSeconds(2));
        $out = ConcSweeper::sweep()[0];
        $row = DB::table('agent_tool_actions')->find($a['id']);
        Conc::check('approved Mac write: left alone inside the window (lease lapsed) and while the Mac holds the lease (window passed); swept to unknown only after both (outcome_unknown receipt); approval itself sent nothing',
            $decided['status'] === 200 && $inside === 'approved' && $alive === 'approved' && $row->state === 'unknown' && $row->dispatched_at === null && str_contains($out['out'], 'unknown=1')
            && DB::table('agent_receipts')->where('action_id', $a['id'])->value('outcome') === 'outcome_unknown', 'inside='.$inside.' alive='.$alive.' after='.$row->state.' '.$out['out']);
        $next = ConcFixture::claim($fx);
        $done = ConcHttp::runner($fx, 'POST', '/runs/'.$c['id'].'/complete', ['generation' => $next['generation'], 'answer' => 'Stopped.']);
        Conc::check('…the next runner (generation 2) completes it and the run ends outcome_unknown; the Mac write was never dispatched from the server', $next['generation'] === 2 && $done['status'] === 200
            && DB::table('agent_runs')->where('id', $c['id'])->value('state') === 'outcome_unknown', 'complete='.$done['status']);
    }
}
