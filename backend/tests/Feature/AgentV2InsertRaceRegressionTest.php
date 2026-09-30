<?php

namespace Tests\Feature;

use App\Services\AgentRuns\Composio\ComposioAccounts;
use App\Services\AgentRuns\Computer\ComputerPublish;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\{AgentV2ComputerFixture, AgentV2Fixture, AgentV2Routes, FakeMcpServer};
use Tests\TestCase;

/**
 * Races the Postgres harness found in insert-if-missing and lock-order code (scenarios `inserts` and `publish`). SQLite cannot show real
 * locking, so each test pins the acquisition ORDER the fix introduced (the lock statement is still issued on SQLite) plus the behaviour
 * the lock protects. The harness is the proof against real concurrency.
 */
class AgentV2InsertRaceRegressionTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2ComputerFixture, AgentV2Routes, FakeMcpServer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
        $this->bootMcp();
    }

    /** @return string[] the SQL statements $act ran, in order */
    private function queries(callable $act): array
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $act();
        $sql = array_column(DB::getQueryLog(), 'query');
        DB::disableQueryLog();
        return $sql;
    }

    private function first(array $sql, string $pattern): int|false
    {
        return collect($sql)->search(fn ($q) => preg_match($pattern, $q) === 1);
    }

    private function assertBefore(array $sql, string $lock, string $then, string $why): void
    {
        $a = $this->first($sql, $lock);
        $b = $this->first($sql, $then);
        $this->assertNotFalse($a, 'The lock statement was never issued: '.$why);
        $this->assertNotFalse($b, 'The guarded statement never ran.');
        $this->assertLessThan($b, $a, $why);
    }

    public function test_browser_site_grants_serialize_on_the_user_row_before_looking_for_the_teammates_browser_connection(): void
    {
        config(['agents_v2_browser.enabled' => true]);
        $sql = $this->queries(fn () => $this->putJson('/api/agents/v2/agents/'.$this->agent['id'].'/browser', ['origins' => ['https://shop.example.com']])
            ->assertOk()->assertJsonPath('browser.generation', 1));
        $this->assertBefore($sql, '/^select \* from "users" where "id" = \?/', '/inner join "agent_connections"/',
            'The pair lookup ran before the user lock, so parallel first grants each created a connection and a grant.');
        $this->putJson('/api/agents/v2/agents/'.$this->agent['id'].'/browser', ['origins' => ['https://shop.example.com', 'https://b.example.org']])
            ->assertOk()->assertJsonPath('browser.generation', 2);
        $this->assertSame([1, 1], [DB::table('agent_connections')->where('provider', 'browser')->whereNull('revoked_at')->count(),
            DB::table('agent_grants')->where('agent_id', $this->agent['id'])->whereNull('revoked_at')->count()]);
    }

    public function test_adding_an_mcp_server_counts_the_cap_under_the_user_lock_and_refuses_the_eleventh(): void
    {
        $add = fn (string $name) => $this->postJson('/api/agents/v2/mcp/servers', ['url' => 'https://mcp.example.com/mcp', 'name' => $name]);
        $sql = $this->queries(fn () => $add('one')->assertCreated());
        $this->assertBefore($sql, '/^select \* from "users" where "id" = \?/', '/select count\(\*\) as "aggregate" from "agent_mcp_servers"/',
            'The server cap was counted before the user lock, so six parallel adds at nine of ten left fifteen servers.');
        foreach (range(2, 9) as $i) { // eight more, inserted directly (the add route itself is throttled to ten a minute)
            $row = \App\Models\AgentV2\Connection::query()->create(['user_id' => $this->user->id, 'provider' => 'mcp_0000000'.$i, 'external_identity' => 's'.$i, 'health' => 'healthy', 'generation' => 1, 'capability_revision' => 1]);
            \App\Models\AgentV2\McpServer::query()->create(['user_id' => $this->user->id, 'connection_id' => $row->id, 'slug' => 'mcp_0000000'.$i, 'url' => 'https://s'.$i.'.example.com/mcp', 'name' => 's'.$i, 'status' => 'active']);
        }
        $add('ten')->assertCreated();
        $add('eleven')->assertStatus(409)->assertJsonPath('code', 'limit_reached');
        $this->assertSame(10, DB::table('agent_mcp_servers')->count());
        $this->assertSame(10, DB::table('agent_connections')->where('provider', 'like', 'mcp_%')->whereNull('revoked_at')->count());
    }

    public function test_linking_a_composio_account_serializes_on_the_user_row_and_reuses_one_connection_per_identity(): void
    {
        $accounts = app(ComposioAccounts::class);
        $store = (new \ReflectionMethod($accounts, 'store'));
        $first = null;
        $sql = $this->queries(function () use ($store, $accounts, &$first) {
            $first = $store->invoke($accounts, $this->user->id, 'airtable', 'ca_one', ['data' => ['email' => 'same@example.com']]);
        });
        $this->assertBefore($sql, '/^select \* from "users" where "id" = \?/', '/^select \* from "agent_connections" where "user_id" = \?/',
            'The identity lookup ran before the user lock, so two links of one identity each created a connection.');
        $second = $store->invoke($accounts, $this->user->id, 'airtable', 'ca_two', ['data' => ['email' => 'same@example.com']]);
        $other = $store->invoke($accounts, $this->user->id, 'airtable', 'ca_three', ['data' => ['email' => 'other@example.com']]);
        $this->assertSame($first->id, $second->id);
        $this->assertSame(2, $second->fresh()->generation);
        $this->assertNotSame($first->id, $other->id);
        $this->assertSame(2, DB::table('agent_connections')->where('provider', 'composio_airtable')->count());
    }

    /** The publish job reserves its write under the same order as cancel, approvals, Mac receipts and the sweeper: run, then action. */
    public function test_the_publish_job_locks_the_run_before_the_action(): void
    {
        $this->bootComputer();
        $conn = $this->computerConnection();
        $run = $this->admit('Publish.');
        $claimed = $this->claim();
        $action = $this->callTool($claimed, 'workspace_read', $conn, ['path' => 'a.txt'], 'p1')->assertOk()->json('action');
        DB::table('agent_tool_actions')->where('id', $action['id'])->update(['state' => 'dispatching', 'phase' => 'uploaded', 'claimed_generation' => $claimed['generation']]);
        DB::table('agent_runs')->where('id', $run['id'])->update(['cancel_requested_at' => now()]); // stale: the job refuses instead of writing, after taking its locks
        $sql = $this->queries(fn () => app(ComputerPublish::class)->run($action['id'], ['branch' => 'vibyra-agent/x']));
        $this->assertBefore($sql, '/^select \* from "agent_runs" where "agent_runs"\."id" = \?/', '/^select \* from "agent_tool_actions" where "agent_tool_actions"\."id" = \?/',
            'The publish job locked the action before the run (an ABBA deadlock with a receipt, approval, cancel or sweep on Postgres).');
        $this->assertSame('failed', DB::table('agent_tool_actions')->where('id', $action['id'])->value('state'), 'The job still closed the stale write as refused.');
    }
}
