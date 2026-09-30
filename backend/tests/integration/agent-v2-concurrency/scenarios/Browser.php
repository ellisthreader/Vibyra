<?php
use App\Services\AgentRuns\Tools\ToolCatalog;
use Illuminate\Support\Facades\DB;

/** Scenario 12: the leased Mac's browser action claims: duplicates from one runner, and an old and a new runner (lease takeover) claiming one submit. */
final class ConcBrowser
{
    public static function run(): void
    {
        Conc::$scenario = '12 browser claims';
        self::oneRunnerClaimsTenTimes();
        self::oldAndNewRunnerClaimTheSameSubmit();
    }

    private static function tool(array $fx, array $c, string $tool, string $conn, array $args, string $id): array
    {
        return ConcFixture::ok(ConcHttp::runner($fx, 'POST', '/runs/'.$c['id'].'/tools', ['generation' => $c['generation'], 'callId' => $id, 'tool' => $tool,
            'connectionId' => $conn, 'schemaRevision' => app(ToolCatalog::class)->schemaRevision($tool), 'arguments' => $args]), 200)['action'];
    }

    private static function page(string $fp): array
    {
        return ['url' => 'https://shop.example.com/contact', 'title' => 'Contact', 'pageFingerprint' => $fp,
            'elements' => [['ref' => 'e1', 'role' => 'textbox', 'name' => 'To', 'value' => 'someone@example.com']],
            'forms' => [['action' => 'https://shop.example.com/send', 'method' => 'post',
                'fields' => [['ref' => 'e1', 'name' => 'to', 'label' => 'To', 'type' => 'email', 'value' => 'someone@example.com']], 'submits' => [['ref' => 'e3', 'label' => 'Send']]]]];
    }

    private static function fingerprint(string $id): string
    {
        return (string) DB::table('agent_tool_actions')->where('id', $id)->value('fingerprint');
    }

    private static function browser(array $fx, array $c, string $id, string $step, array $json): array
    {
        return ConcHttp::runner($fx, 'POST', '/runs/'.$c['id'].'/browser/'.$id.'/'.$step, ['generation' => $c['generation']] + $json);
    }

    /** A browser_submit the person approved, ready for the Mac to claim. */
    private static function stage(): array
    {
        $fx = ConcFixture::make(false);
        $fx['runtime'] = ConcFixture::ok(ConcHttp::call('POST', '/api/agents/v2/runtimes', $fx['token'], ['hostId' => $fx['hostId'], 'provider' => 'codex', 'accountRef' => 'acct-1',
            'model' => 'gpt-5.5', 'effort' => 'medium', 'providerVersion' => '1.2.3', 'capabilities' => ['controlledTools' => true, 'browserTools' => true]]), 201)['runtime'];
        $conn = ConcFixture::ok(ConcHttp::call('PUT', '/api/agents/v2/agents/'.$fx['agent'].'/browser', $fx['token'], ['origins' => ['https://shop.example.com']]), 200)['browser']['connectionId'];
        ConcFixture::admit($fx, 'Send the contact form.');
        $c = ConcFixture::claim($fx);
        $fp = str_repeat('b', 64);
        $snap = self::tool($fx, $c, 'browser_snapshot', $conn, [], 's1');
        ConcFixture::ok(self::browser($fx, $c, $snap['id'], 'claim', ['fingerprint' => self::fingerprint($snap['id'])]), 200);
        ConcFixture::ok(self::browser($fx, $c, $snap['id'], 'receipt', ['result' => self::page($fp)]), 200);
        $submit = self::tool($fx, $c, 'browser_submit', $conn, ['ref' => 'e3', 'pageFingerprint' => $fp], 'w1');
        $f = self::fingerprint($submit['id']);
        ConcFixture::ok(ConcHttp::call('POST', '/api/agents/v2/actions/'.$submit['id'].'/decision', $fx['token'], ['fingerprint' => $f, 'decision' => 'allow']), 200);
        return ['fx' => $fx, 'c' => $c, 'id' => $submit['id'], 'fingerprint' => $f];
    }

    private static function claimJob(array $s, int $generation, int $jitter = 0): array
    {
        return ['op' => 'runner', 'fx' => $s['fx'], 'method' => 'POST', 'suffix' => '/runs/'.$s['c']['id'].'/browser/'.$s['id'].'/claim',
            'json' => ['generation' => $generation, 'fingerprint' => $s['fingerprint']], 'jitterMs' => $jitter];
    }

    private static function oneRunnerClaimsTenTimes(): void
    {
        $s = self::stage();
        $race = ConcRace::run(array_fill(0, 10, self::claimJob($s, $s['c']['generation'])));
        $row = DB::table('agent_tool_actions')->find($s['id']);
        $states = array_unique(array_map(fn ($r) => $r['result']['json']['action']['state'] ?? '?', $race));
        Conc::check('10 parallel browser claims of one approved submit by the same runner: all 200, one action in dispatching, claimed under the current generation',
            $row->state === 'dispatching' && (int) $row->claimed_generation === (int) $s['c']['generation'] && Conc::tally($race) === ['200' => 10] && $states === ['dispatching'], Conc::fmt(Conc::tally($race)).' state='.$row->state);
    }

    /** The Mac's lease lapsed and a new runner took the run (generation 2) just as the old one (generation 1) tries to claim the submit. */
    private static function oldAndNewRunnerClaimTheSameSubmit(): void
    {
        $bad = []; $outcomes = []; $deadlocks0 = ConcPg::count('deadlock detected'); $codes = [];
        foreach (range(0, 9) as $i) {
            $s = self::stage();
            DB::table('agent_runs')->where('id', $s['c']['id'])->update(['lease_expires_at' => now()->subSeconds(2)]);
            // The new runner starts 0 to 80 ms late, so the old runner wins the submit in some rounds and loses it in others.
            $jobs = [['op' => 'takeover_claim', 'fx' => $s['fx'], 'action' => $s['id'], 'fingerprint' => $s['fingerprint'], 'jitterMs' => [0, 3, 6, 10, 15, 20, 30, 40, 60, 80][$i]],
                self::claimJob($s, 1), self::claimJob($s, 1, 2), self::claimJob($s, 1, 4)];
            $race = ConcRace::run($jobs);
            foreach (Conc::tally(array_slice($race, 1)) as $k => $n) $codes[$k] = ($codes[$k] ?? 0) + $n;
            $new = $race[0]['result'] ?? [];
            $old = array_map(fn ($r) => $r['result'] ?? [], array_slice($race, 1));
            $oldRan = count(array_filter($old, fn ($r) => ($r['status'] ?? 0) === 200 && ($r['json']['action']['state'] ?? '') === 'dispatching'));
            $newRuns = ($new['status'] ?? 0) === 200 && ($new['state'] ?? '') === 'dispatching';
            $row = DB::table('agent_tool_actions')->find($s['id']);
            $outcomes[$row->state.'/g'.$row->claimed_generation] = ($outcomes[$row->state.'/g'.$row->claimed_generation] ?? 0) + 1;
            // At most one generation may be told to click Send. The new runner's claim either wins the submit (dispatching, generation 2, every
            // old claim refused) or finds the old runner's claim and is told the write is unknown; it must never be told to go ahead as well.
            $ok = !($oldRan > 0 && $newRuns) && ($newRuns ? $row->state === 'dispatching' && (int) $row->claimed_generation === 2
                : $oldRan > 0 && ($new['state'] ?? '') === 'unknown' && $row->state === 'unknown');
            if (!$ok || ($new['claimStatus'] ?? 0) !== 200) $bad[] = 'round '.$i.' new='.json_encode($new).' oldRan='.$oldRan.' state='.$row->state.'/g'.$row->claimed_generation;
        }
        ksort($codes); ksort($outcomes);
        Conc::check('10 rounds of the old runner (generation 1) claiming a browser submit while a new runner takes the lease and claims it (generation 2): never both allowed to submit; the loser is refused stale_lease or the write is shown unknown',
            !$bad, 'final states '.json_encode($outcomes).'; old-runner HTTP '.Conc::fmt($codes).($bad ? ' BAD: '.implode('; ', array_slice($bad, 0, 3)) : ''));
        Conc::check('…no deadlock and no 5xx between the two runners claiming', ConcPg::count('deadlock detected') === $deadlocks0 && !array_intersect_key($codes, array_flip(['500', '503', 'crash'])), 'deadlocks='.(ConcPg::count('deadlock detected') - $deadlocks0));
    }
}
