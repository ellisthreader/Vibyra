<?php
use App\Services\AgentRuns\Connections\LegacyInstalls;
use Illuminate\Support\Facades\DB;

/** Scenario 4b: first-sync races, idempotent tool calls, and the leased Mac's claim/receipt under duplicates and conflicts. */
final class ConcConnections
{
    public static function run(): void
    {
        Conc::$scenario = '4b connections + Mac receipts';
        self::firstSyncOfAnInstall();
        self::firstSyncOfAWorkspace();
        self::sameCallIdAndDistinctCalls();
        self::firstRuntimeRegistrations();
        self::firstGrantPuts();
        self::addTheSameAccountTwice();
        self::macReceipts();
    }

    private static function list(array $fx): array
    {
        return ['op' => 'call', 'method' => 'GET', 'uri' => '/api/agents/v2/connections', 'token' => $fx['token'], 'headers' => ['X-Conc-Ip' => 'c'.random_int(0, 1 << 30)]];
    }

    private static function firstSyncOfAnInstall(): void
    {
        $fx = ConcFixture::make(false);
        DB::table('vibes_integration_installs')->insert(['user_id' => $fx['user'], 'integration' => 'gmail', 'credential' => Illuminate\Support\Facades\Crypt::encryptString('tok-'.$fx['user']),
            'account_label' => 'fresh@example.com', 'connected_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        $race = ConcRace::run(array_map(fn () => self::list($fx), range(1, 12)));
        $rows = DB::table('agent_connections')->where('user_id', $fx['user'])->where('provider', 'gmail')->count();
        $t = Conc::tally($race);
        Conc::check('12 parallel first-ever syncs of a freshly connected Gmail install: one connection row and every caller gets 200', $rows === 1 && $t === ['200' => 12], 'rows='.$rows.' '.Conc::fmt($t));
    }

    private static function firstSyncOfAWorkspace(): void
    {
        $fx = ConcFixture::workspace(ConcFixture::make(false));
        $race = ConcRace::run(array_map(fn () => self::list($fx), range(1, 12)));
        $rows = DB::table('agent_connections')->where('workspace_id', $fx['workspace'])->count();
        $grants = DB::table('agent_grants')->where('agent_id', $fx['agent'])->whereNull('revoked_at')->count();
        $t = Conc::tally($race);
        Conc::check('12 parallel first-ever syncs of a Mac folder grant: one computer connection, one grant, every caller 200', $rows === 1 && $grants === 1 && $t === ['200' => 12], 'connections='.$rows.' grants='.$grants.' '.Conc::fmt($t));
    }

    private static function sameCallIdAndDistinctCalls(): void
    {
        $fx = ConcFixture::make(true);
        ConcFixture::admit($fx, 'Search twice.');
        $c = ConcFixture::claim($fx);
        $same = array_map(fn () => ['op' => 'call', 'method' => 'POST', 'uri' => '/api/agents/v2/runner/'.$fx['runtime']['id'].'/runs/'.$c['id'].'/tools', 'token' => $fx['token'],
            'headers' => ['X-Vibyra-Runner-Key' => $fx['runtime']['runnerKey']], 'json' => ['generation' => $c['generation'], 'callId' => 'same-call', 'tool' => 'gmail_search',
                'connectionId' => $fx['gmail'], 'schemaRevision' => app(App\Services\AgentRuns\Tools\ToolCatalog::class)->schemaRevision('gmail_search'), 'arguments' => ['query' => 'from:boss']]], range(1, 10));
        $race = ConcRace::run($same);
        $actions = DB::table('agent_tool_actions')->where('run_id', $c['id'])->where('call_id', 'same-call')->count();
        $reads = DB::table('conc_calls')->where('kind', 'GMAIL_READ')->where('ckey', 'tok-'.$fx['user'])->count();
        $run = DB::table('agent_runs')->find($c['id']);
        Conc::check('10 runners retrying one callId at once: one action row, one provider read, tool_calls=1, every caller 200', $actions === 1 && $reads === 1 && (int) $run->tool_calls === 1
            && Conc::tally($race) === ['200' => 10], 'actions='.$actions.' provider reads='.$reads.' tool_calls='.$run->tool_calls.' '.Conc::fmt(Conc::tally($race)));
        $jobs = array_map(fn ($i) => ['op' => 'call', 'method' => 'POST', 'uri' => '/api/agents/v2/runner/'.$fx['runtime']['id'].'/runs/'.$c['id'].'/tools', 'token' => $fx['token'],
            'headers' => ['X-Vibyra-Runner-Key' => $fx['runtime']['runnerKey']], 'json' => ['generation' => $c['generation'], 'callId' => 'distinct-'.$i, 'tool' => 'gmail_search',
                'connectionId' => $fx['gmail'], 'schemaRevision' => app(App\Services\AgentRuns\Tools\ToolCatalog::class)->schemaRevision('gmail_search'), 'arguments' => ['query' => 'q'.$i]]], range(1, 12));
        $race = ConcRace::run($jobs);
        $run = DB::table('agent_runs')->find($c['id']);
        Conc::check('12 distinct tool calls at once: tool_calls counts all of them exactly (1 + 12), no lost update', (int) $run->tool_calls === 13 && Conc::tally($race) === ['200' => 12], 'tool_calls='.$run->tool_calls);
    }

    private static function firstRuntimeRegistrations(): void
    {
        foreach (['a brand-new computer' => false, 'a paired computer that has no binding yet' => true] as $label => $paired) {
            $user = \App\Models\User::factory()->create();
            $token = 'conc-'.$user->id.'-'.bin2hex(random_bytes(6));
            \App\Models\VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', $token), 'device_name' => 'Mac']);
            $host = bin2hex(random_bytes(32));
            if ($paired) DB::table('remote_hosts')->insert(['user_id' => $user->id, 'host_id' => $host, 'name' => 'Mac', 'platform' => 'macos', 'registered_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
            $job = ['op' => 'call', 'method' => 'POST', 'uri' => '/api/agents/v2/runtimes', 'token' => $token, 'json' => ['hostId' => $host, 'provider' => 'claude',
                'accountRef' => 'default', 'model' => 'claude-sonnet', 'capabilities' => ['controlledTools' => true]]];
            $race = ConcRace::run(array_fill(0, 8, $job));
            $t = Conc::tally($race);
            $bindings = DB::table('agent_runtime_bindings')->where('user_id', $user->id)->where('host_id', $host)->whereNull('revoked_at')->get();
            $hosts = DB::table('remote_hosts')->where('host_id', $host)->count();
            Conc::check('8 parallel first registrations from '.$label.': one host row, one active binding, every caller 201', $bindings->count() === 1 && $hosts === 1 && $t === ['201' => 8],
                'bindings='.$bindings->count().' hosts='.$hosts.' '.Conc::fmt($t).($bindings->count() === 1 ? ' revision='.$bindings[0]->revision : ''));
        }
    }

    private static function firstGrantPuts(): void
    {
        $fx = ConcFixture::make(false);
        $conn = ConcFixture::gmailInstall($fx['user']);
        $put = fn (array $ops) => ['op' => 'call', 'method' => 'PUT', 'uri' => '/api/agents/v2/agents/'.$fx['agent'].'/grants/'.$conn, 'token' => $fx['token'], 'json' => ['operations' => $ops]];
        $race = ConcRace::run(array_fill(0, 10, $put(['gmail_read', 'gmail_search'])));
        $active = DB::table('agent_grants')->where('agent_id', $fx['agent'])->where('connection_id', $conn)->whereNull('revoked_at')->get();
        Conc::check('10 parallel first grants of one connection to one teammate: exactly one active grant row (revision 1), every caller 200', $active->count() === 1 && Conc::tally($race) === ['200' => 10],
            'active grants='.$active->count().' '.Conc::fmt(Conc::tally($race)));
        $race = ConcRace::run(array_map(fn ($i) => $put($i % 2 ? ['gmail_read'] : ['gmail_read', 'gmail_search', 'gmail_send']), range(0, 9)));
        $active = DB::table('agent_grants')->where('agent_id', $fx['agent'])->where('connection_id', $conn)->whereNull('revoked_at')->get();
        Conc::check('10 parallel edits of that grant with two different operation sets: still one active grant whose operations are one of the two sets, revision advanced', $active->count() === 1 && Conc::tally($race) === ['200' => 10]
            && in_array(json_decode($active[0]->operations, true), [['gmail_read'], ['gmail_read', 'gmail_search', 'gmail_send']], true) && (int) $active[0]->revision >= 2,
            'active='.$active->count().' revision='.($active[0]->revision ?? '?').' ops='.($active[0]->operations ?? '?'));
    }

    /** "Add another account" completing twice at once for one identity (a double callback, or two devices). */
    private static function addTheSameAccountTwice(): void
    {
        $fx = ConcFixture::make(false);
        $job = ['op' => 'call', 'method' => 'POST', 'uri' => '/api/agents/v2/connections', 'token' => $fx['token'], 'json' => ['provider' => 'github', 'credential' => 'ghp_conc_token']];
        $race = ConcRace::run(array_fill(0, 8, $job));
        $rows = DB::table('agent_connections')->where('user_id', $fx['user'])->where('provider', 'github')->whereNull('revoked_at')->get();
        $ids = array_unique(array_map(fn ($r) => $r['result']['json']['connection']['id'] ?? '?', $race));
        Conc::check('8 parallel "add account" completions for one GitHub identity: one active connection row, every caller 201 and told the same connection ID',
            $rows->count() === 1 && Conc::tally($race) === ['201' => 8] && count($ids) === 1, 'active rows='.$rows->count().' distinct ids='.count($ids).' '.Conc::fmt(Conc::tally($race)));
    }

    private static function macReceipts(): void
    {
        $fx = ConcFixture::workspace(ConcFixture::make(false));
        LegacyInstalls::sync($fx['user']);
        $conn = (string) DB::table('agent_connections')->where('workspace_id', $fx['workspace'])->value('id');
        ConcFixture::admit($fx, 'Read notes.');
        $c = ConcFixture::claim($fx);
        $mk = function (string $id) use ($fx, $c, $conn) {
            $rev = app(App\Services\AgentRuns\Tools\ToolCatalog::class)->schemaRevision('workspace_read');
            $r = ConcHttp::runner($fx, 'POST', '/runs/'.$c['id'].'/tools', ['generation' => $c['generation'], 'callId' => $id, 'tool' => 'workspace_read',
                'connectionId' => $conn, 'schemaRevision' => $rev, 'arguments' => ['path' => 'notes.txt']]);
            return $r['json']['action'];
        };
        $a = $mk('r1');
        $a['fingerprint'] ??= DB::table('agent_tool_actions')->where('id', $a['id'])->value('fingerprint');
        $body = fn (string $m, string $s, array $j) => ['op' => 'runner', 'fx' => $fx, 'method' => 'POST', 'suffix' => '/runs/'.$c['id'].'/computer/'.$a['id'].'/'.$s, 'json' => $j];
        $claim = ['generation' => $c['generation'], 'fingerprint' => $a['fingerprint']];
        $race = ConcRace::run(array_fill(0, 10, $body('POST', 'claim', $claim)));
        $row = DB::table('agent_tool_actions')->find($a['id']);
        Conc::check('10 parallel Mac claims of one approved action: all 200, one transition to dispatching, claimed under the current generation', $row->state === 'dispatching' && (int) $row->claimed_generation === (int) $c['generation']
            && Conc::tally($race) === ['200' => 10], Conc::fmt(Conc::tally($race)));
        $receipt = ['content' => "hello\n", 'sha256' => hash('sha256', "hello\n")];
        $race = ConcRace::run(array_fill(0, 10, $body('POST', 'receipt', ['generation' => $c['generation'], 'result' => $receipt])));
        $results = DB::table('agent_run_events')->where('run_id', $c['id'])->where('type', 'tool.result')->count();
        Conc::check('10 parallel identical Mac receipts: duplicates are no-ops — one receipt row, one tool.result event, all 200', Conc::tally($race) === ['200' => 10]
            && DB::table('agent_receipts')->where('action_id', $a['id'])->count() === 1 && $results === 1 && DB::table('agent_tool_actions')->where('id', $a['id'])->value('state') === 'completed', 'tool.result events='.$results.' '.Conc::fmt(Conc::tally($race)));
        $b = $mk('r2');
        $b['fingerprint'] ??= DB::table('agent_tool_actions')->where('id', $b['id'])->value('fingerprint');
        $body2 = fn (array $j, string $s) => ['op' => 'runner', 'fx' => $fx, 'method' => 'POST', 'suffix' => '/runs/'.$c['id'].'/computer/'.$b['id'].'/'.$s, 'json' => $j];
        ConcRace::run(array_fill(0, 3, $body2(['generation' => $c['generation'], 'fingerprint' => $b['fingerprint']], 'claim')));
        $x = ['content' => 'A', 'sha256' => hash('sha256', 'A')]; $y = ['content' => 'B', 'sha256' => hash('sha256', 'B')];
        $jobs = [];
        foreach (range(1, 5) as $i) { $jobs[] = $body2(['generation' => $c['generation'], 'result' => $x], 'receipt'); $jobs[] = $body2(['generation' => $c['generation'], 'result' => $y], 'receipt'); }
        $race = ConcRace::run($jobs);
        $t = Conc::tally($race);
        $stored = json_decode(DB::table('agent_tool_actions')->where('id', $b['id'])->value('result'), true)['content'] ?? null;
        Conc::check('5×receipt A + 5×receipt B at once: one content wins; same-content duplicates 200, the other content 409 receipt_conflict; one receipt row',
            ($t['200'] ?? 0) === 5 && ($t['409:receipt_conflict'] ?? 0) === 5 && in_array($stored, ['A', 'B'], true) && DB::table('agent_receipts')->where('action_id', $b['id'])->count() === 1, 'winner='.$stored.' '.Conc::fmt($t));
    }
}
