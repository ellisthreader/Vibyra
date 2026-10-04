<?php
use App\Services\AgentRuns\Tools\ToolCatalog;
use Illuminate\Support\Facades\DB;

/** Scenario 13: the leased Mac's local MCP claims and receipts: duplicates from one runner, an old and a new runner (lease takeover), and receipt races. */
final class ConcLocalMcp
{
    private const TOOLS = [['name' => 'write_file', 'description' => 'Write a file.', 'inputSchema' => ['type' => 'object',
        'properties' => ['path' => ['type' => 'string']], 'required' => ['path']]]];

    public static function run(): void
    {
        Conc::$scenario = '13 local MCP claims';
        self::oneRunnerClaimsTenTimes();
        self::oldAndNewRunnerClaimTheSameWrite();
        self::twoRunnersPostTheSameReceipt();
    }

    private static function fingerprint(string $id): string
    {
        return (string) DB::table('agent_tool_actions')->where('id', $id)->value('fingerprint');
    }

    /** A local write the person approved, ready for the Mac to claim. */
    private static function stage(): array
    {
        $fx = ConcFixture::make(false);
        $fx['runtime'] = ConcFixture::ok(ConcHttp::call('POST', '/api/agents/v2/runtimes', $fx['token'], ['hostId' => $fx['hostId'], 'provider' => 'codex', 'accountRef' => 'acct-1',
            'model' => 'gpt-5.5', 'effort' => 'medium', 'providerVersion' => '1.2.3', 'capabilities' => ['controlledTools' => true, 'localMcp' => true]]), 201)['runtime'];
        $server = ConcFixture::ok(ConcHttp::call('POST', '/api/agents/v2/local-mcp/servers', $fx['token'], ['hostId' => $fx['hostId'],
            'localId' => bin2hex(random_bytes(8)), 'name' => 'Files', 'tools' => self::TOOLS]), 201)['server'];
        $tool = $server['provider'].'__write_file';
        ConcFixture::ok(ConcHttp::call('PUT', '/api/agents/v2/agents/'.$fx['agent'].'/grants/'.$server['connectionId'], $fx['token'], ['operations' => [$tool]]), 200);
        ConcFixture::admit($fx, 'Save the notes.');
        $c = ConcFixture::claim($fx);
        $action = ConcFixture::ok(ConcHttp::runner($fx, 'POST', '/runs/'.$c['id'].'/tools', ['generation' => $c['generation'], 'callId' => 'w1', 'tool' => $tool,
            'connectionId' => $server['connectionId'], 'schemaRevision' => app(ToolCatalog::class)->schemaRevision($tool), 'arguments' => ['path' => 'a.txt']]), 200)['action'];
        $f = self::fingerprint($action['id']);
        ConcFixture::ok(ConcHttp::call('POST', '/api/agents/v2/actions/'.$action['id'].'/decision', $fx['token'], ['fingerprint' => $f, 'decision' => 'allow']), 200);
        return ['fx' => $fx, 'c' => $c, 'id' => $action['id'], 'fingerprint' => $f];
    }

    private static function claimJob(array $s, int $generation, int $jitter = 0): array
    {
        return ['op' => 'runner', 'fx' => $s['fx'], 'method' => 'POST', 'suffix' => '/runs/'.$s['c']['id'].'/local-mcp/'.$s['id'].'/claim',
            'json' => ['generation' => $generation, 'fingerprint' => $s['fingerprint'], 'tools' => self::TOOLS], 'jitterMs' => $jitter];
    }

    private static function oneRunnerClaimsTenTimes(): void
    {
        $s = self::stage();
        $race = ConcRace::run(array_fill(0, 10, self::claimJob($s, $s['c']['generation'])));
        $row = DB::table('agent_tool_actions')->find($s['id']);
        $states = array_unique(array_map(fn ($r) => $r['result']['json']['action']['state'] ?? '?', $race));
        Conc::check('10 parallel local MCP claims of one approved write by the same runner: all 200, one action in dispatching, claimed under the current generation',
            $row->state === 'dispatching' && (int) $row->claimed_generation === (int) $s['c']['generation'] && Conc::tally($race) === ['200' => 10] && $states === ['dispatching'], Conc::fmt(Conc::tally($race)).' state='.$row->state);
    }

    /** The Mac's lease lapsed and a new runner took the run (generation 2) just as the old one (generation 1) tries to claim the write. */
    private static function oldAndNewRunnerClaimTheSameWrite(): void
    {
        $bad = []; $outcomes = []; $deadlocks0 = ConcPg::count('deadlock detected'); $codes = [];
        foreach (range(0, 9) as $i) {
            $s = self::stage();
            DB::table('agent_runs')->where('id', $s['c']['id'])->update(['lease_expires_at' => now()->subSeconds(2)]);
            $jobs = [['op' => 'takeover_claim', 'fx' => $s['fx'], 'action' => $s['id'], 'fingerprint' => $s['fingerprint'], 'path' => 'local-mcp', 'claim' => ['tools' => self::TOOLS],
                'jitterMs' => [0, 3, 6, 10, 15, 20, 30, 40, 60, 80][$i]], self::claimJob($s, 1), self::claimJob($s, 1, 2), self::claimJob($s, 1, 4)];
            $race = ConcRace::run($jobs);
            foreach (Conc::tally(array_slice($race, 1)) as $k => $n) $codes[$k] = ($codes[$k] ?? 0) + $n;
            $new = $race[0]['result'] ?? [];
            $old = array_map(fn ($r) => $r['result'] ?? [], array_slice($race, 1));
            $oldRan = count(array_filter($old, fn ($r) => ($r['status'] ?? 0) === 200 && ($r['json']['action']['state'] ?? '') === 'dispatching'));
            $newRuns = ($new['status'] ?? 0) === 200 && ($new['state'] ?? '') === 'dispatching';
            $row = DB::table('agent_tool_actions')->find($s['id']);
            $outcomes[$row->state.'/g'.$row->claimed_generation] = ($outcomes[$row->state.'/g'.$row->claimed_generation] ?? 0) + 1;
            // At most one generation may be told to run the write: the new runner either wins it (dispatching, generation 2) or finds the
            // old claim and is told the write is unknown; never both.
            $ok = !($oldRan > 0 && $newRuns) && ($newRuns ? $row->state === 'dispatching' && (int) $row->claimed_generation === 2
                : $oldRan > 0 && ($new['state'] ?? '') === 'unknown' && $row->state === 'unknown');
            if (!$ok || ($new['claimStatus'] ?? 0) !== 200) $bad[] = 'round '.$i.' new='.json_encode($new).' oldRan='.$oldRan.' state='.$row->state.'/g'.$row->claimed_generation;
        }
        ksort($codes); ksort($outcomes);
        Conc::check('10 rounds of the old runner (generation 1) claiming a local MCP write while a new runner takes the lease and claims it (generation 2): never both allowed to run it; the loser is refused stale_lease or the write is shown unknown',
            !$bad, 'final states '.json_encode($outcomes).'; old-runner HTTP '.Conc::fmt($codes).($bad ? ' BAD: '.implode('; ', array_slice($bad, 0, 3)) : ''));
        Conc::check('…no deadlock and no 5xx between the two runners claiming', ConcPg::count('deadlock detected') === $deadlocks0 && !array_intersect_key($codes, array_flip(['500', '503', 'crash'])), 'deadlocks='.(ConcPg::count('deadlock detected') - $deadlocks0));
    }

    /** The same receipt posted ten times at once, and two different receipts racing: exactly one outcome is ever recorded. */
    private static function twoRunnersPostTheSameReceipt(): void
    {
        $s = self::stage();
        ConcFixture::ok(ConcHttp::runner($s['fx'], 'POST', '/runs/'.$s['c']['id'].'/local-mcp/'.$s['id'].'/claim',
            ['generation' => $s['c']['generation'], 'fingerprint' => $s['fingerprint'], 'tools' => self::TOOLS]), 200);
        $receipt = fn (string $text) => ['op' => 'runner', 'fx' => $s['fx'], 'method' => 'POST', 'suffix' => '/runs/'.$s['c']['id'].'/local-mcp/'.$s['id'].'/receipt',
            'json' => ['generation' => $s['c']['generation'], 'result' => ['text' => $text]]];
        $race = ConcRace::run(array_merge(array_fill(0, 6, $receipt('written')), array_fill(0, 4, $receipt('something else'))));
        $tally = Conc::tally($race);
        $row = DB::table('agent_tool_actions')->find($s['id']);
        $receipts = DB::table('agent_receipts')->where('action_id', $s['id'])->count();
        $text = json_decode($row->result, true)['text'] ?? null;
        $winner = $text === 'written' ? 6 : 4;
        Conc::check('10 racing receipts for one local MCP write (6 identical, 4 different): the action completes once with one stored receipt; identical duplicates are 200, the other text is 409 receipt_conflict',
            $row->state === 'completed' && $receipts === 1 && ($tally['200'] ?? 0) === $winner && ($tally['409:receipt_conflict'] ?? 0) === 10 - $winner && !array_intersect_key($tally, array_flip(['500', '503', 'crash'])),
            Conc::fmt($tally).' state='.$row->state.' receipts='.$receipts);
    }
}
