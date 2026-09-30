<?php
use App\Models\AgentV2\{Connection, McpServer};
use Illuminate\Support\Facades\DB;

/** Scenario 10: the insert-if-missing paths that had not been raced: browser grants, remote MCP servers, Composio accounts. */
final class ConcInserts
{
    public static function run(): void
    {
        Conc::$scenario = '10 insert-if-missing paths';
        self::browserGrants();
        self::mcpServerCap();
        self::composioAccounts();
    }

    private static function browserRows(array $fx): array
    {
        $conns = DB::table('agent_connections')->where('user_id', $fx['user'])->where('provider', 'browser')->whereNull('revoked_at')->pluck('id')->all();
        $grants = DB::table('agent_grants')->where('agent_id', $fx['agent'])->whereNull('revoked_at')->whereIn('connection_id', $conns)->get();
        return [count($conns), $grants->count(), $conns];
    }

    private static function browserGrants(): void
    {
        $fx = ConcFixture::make(false);
        $put = fn (array $origins) => ['op' => 'call', 'method' => 'PUT', 'uri' => '/api/agents/v2/agents/'.$fx['agent'].'/browser', 'token' => $fx['token'], 'json' => ['origins' => $origins]];
        $race = ConcRace::run(array_fill(0, 10, $put(['https://shop.example.com'])));
        [$conns, $grants] = self::browserRows($fx);
        $ids = array_unique(array_map(fn ($r) => $r['result']['json']['browser']['connectionId'] ?? '?', $race));
        Conc::check('10 parallel first browser-site grants for one teammate: one browser connection, one grant, every caller 200 and told the same connection',
            $conns === 1 && $grants === 1 && Conc::tally($race) === ['200' => 10] && count($ids) === 1, 'connections='.$conns.' grants='.$grants.' distinct ids='.count($ids).' '.Conc::fmt(Conc::tally($race)));
        $sets = [['https://shop.example.com'], ['https://other.example.org', 'https://shop.example.com']]; // the server stores origins sorted
        $race = ConcRace::run(array_map(fn ($i) => $put($i % 2 ? array_reverse($sets[1]) : $sets[0]), range(0, 9)));
        [$conns, $grants, $ids] = self::browserRows($fx);
        $scopes = $conns ? json_decode((string) DB::table('agent_connections')->where('id', $ids[0])->value('scopes'), true) : null;
        Conc::check('10 parallel edits with two different site sets: still one connection and one grant, whose sites are one of the two sets',
            $conns === 1 && $grants === 1 && Conc::tally($race) === ['200' => 10] && in_array($scopes, $sets, true), 'connections='.$conns.' grants='.$grants.' scopes='.json_encode($scopes));
    }

    /** Nine servers already added; six more adds at once may let at most one through the ten-server cap. */
    private static function mcpServerCap(): void
    {
        $fx = ConcFixture::make(false);
        foreach (range(1, 9) as $i) {
            $slug = 'mcp_'.bin2hex(random_bytes(4));
            $row = Connection::query()->create(['user_id' => $fx['user'], 'provider' => $slug, 'external_identity' => 'seed'.$i.'.example.com', 'health' => 'healthy', 'generation' => 1, 'capability_revision' => 1]);
            McpServer::query()->create(['user_id' => $fx['user'], 'connection_id' => $row->id, 'slug' => $slug, 'url' => 'https://seed'.$i.'.example.com/mcp', 'name' => 'Seed '.$i, 'status' => 'active']);
        }
        $add = fn (int $i) => ['op' => 'call', 'method' => 'POST', 'uri' => '/api/agents/v2/mcp/servers', 'token' => $fx['token'], 'json' => ['url' => ConcProviders::MCP, 'name' => 'Docs '.$i], 'headers' => ['X-Conc-Ip' => 'mcp'.$i]];
        $race = ConcRace::run(array_map($add, range(1, 6)));
        $t = Conc::tally($race);
        $active = DB::table('agent_connections')->where('user_id', $fx['user'])->where('provider', 'like', 'mcp\_%')->whereNull('revoked_at')->count();
        Conc::check('6 parallel "add MCP server" calls with 9 of 10 slots used: exactly one is accepted (201), five refused limit_reached, never more than 10 active servers',
            $active === 10 && ($t['201'] ?? 0) === 1 && ($t['409:limit_reached'] ?? 0) === 5, 'active servers='.$active.' '.Conc::fmt($t));
    }

    private static function composioAccounts(): void
    {
        $fx = ConcFixture::make(false);
        $store = fn (int $i, string $email) => ['op' => 'composio_store', 'user' => $fx['user'], 'account' => 'ca_conc_'.$i, 'email' => $email];
        $race = ConcRace::run(array_map(fn ($i) => $store($i, 'same@example.com'), range(1, 8)));
        $rows = DB::table('agent_connections')->where('user_id', $fx['user'])->where('provider', 'composio_airtable')->whereNull('revoked_at')->get();
        $ids = array_unique(array_map(fn ($r) => $r['result']['id'] ?? '?', $race));
        Conc::check('8 parallel completions of Composio links for one account identity: one active connection (the same ID for every caller), not eight',
            $rows->count() === 1 && count($ids) === 1 && !array_filter($race, fn ($r) => isset($r['crash']) || isset($r['result']['crash'])), 'active rows='.$rows->count().' distinct ids='.count($ids).' generation='.($rows[0]->generation ?? '?'));
        $race = ConcRace::run(array_map(fn ($i) => $store($i, 'person'.$i.'@example.com'), range(1, 6)));
        $distinct = DB::table('agent_connections')->where('user_id', $fx['user'])->where('provider', 'composio_airtable')->whereNull('revoked_at')->count();
        Conc::check('6 parallel links for six different identities still make six connections (the lock serializes, it does not merge)', $distinct === 7 && count(array_unique(array_column(array_column($race, 'result'), 'id'))) === 6, 'active rows='.$distinct);
    }
}
