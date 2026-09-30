<?php

namespace Tests\Feature;

use App\Models\AgentV2\{Connection, Trigger, TriggerEvent};
use App\Services\AgentRuns\Computer\ComputerTools;
use App\Services\AgentRuns\Connections\LegacyInstalls;
use App\Services\AgentRuns\Grants;
use App\Services\AgentRuns\Tools\Approvals;
use App\Services\AgentTriggers\TriggerIntake;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\{Crypt, DB, Http};
use Illuminate\Support\Str;
use Tests\Support\{AgentV2ComputerFixture, AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/**
 * Bugs the Postgres process-race harness (tests/integration/agent-v2-concurrency) found, pinned on SQLite:
 * the losing side of each race is simulated by inserting the winner's row just before our own INSERT runs.
 * The harness itself is the proof against real concurrency; these keep the fixes from being undone.
 */
class AgentV2ConcurrencyRegressionTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2ComputerFixture, AgentV2Routes;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
    }

    /** Run $act; just before its first INSERT into $table, "another process" inserts $row and wins the race. */
    private function losingTo(string $table, array $row, callable $act): mixed
    {
        $fired = false;
        DB::beforeExecuting(function (string $query) use ($table, $row, &$fired) {
            if ($fired || !preg_match('/^insert (or ignore )?into "'.$table.'"/i', $query)) return;
            $fired = true;
            DB::table($table)->insert($row);
        });
        $result = $act();
        $this->assertTrue($fired, 'The competing insert never fired; the test no longer exercises the race.');
        return $result;
    }

    public function test_the_first_sync_of_a_new_install_survives_another_request_creating_the_connection_first(): void
    {
        DB::table('vibes_integration_installs')->insert(['user_id' => $this->user->id, 'integration' => 'gmail', 'credential' => Crypt::encryptString('t'),
            'account_label' => 'fresh@example.com', 'connected_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        $install = DB::table('vibes_integration_installs')->where('user_id', $this->user->id)->first();
        $this->losingTo('agent_connections', ['id' => (string) Str::uuid(), 'user_id' => $this->user->id, 'provider' => 'gmail',
            'external_identity' => 'fresh@example.com', 'install_id' => $install->id, 'install_connected_at' => $install->connected_at,
            'generation' => 1, 'capability_revision' => 1, 'health' => 'healthy', 'created_at' => now(), 'updated_at' => now()],
            fn () => LegacyInstalls::sync($this->user->id));
        $this->assertSame(1, DB::table('agent_connections')->where('install_id', $install->id)->count());
    }

    public function test_the_first_sync_of_a_mac_folder_grant_survives_another_request_creating_the_connection_first(): void
    {
        $this->bootComputer();
        $this->losingTo('agent_connections', ['id' => (string) Str::uuid(), 'user_id' => $this->user->id, 'provider' => ComputerTools::PROVIDER,
            'external_identity' => 'Vibyra repo', 'workspace_id' => $this->workspaceId, 'generation' => 1, 'capability_revision' => 1,
            'health' => 'healthy', 'created_at' => now(), 'updated_at' => now()], fn () => LegacyInstalls::sync($this->user->id));
        $this->assertSame(1, DB::table('agent_connections')->where('workspace_id', $this->workspaceId)->count());
    }

    private function registerHost(string $hostId)
    {
        return $this->postJson('/api/agents/v2/runtimes', ['hostId' => $hostId, 'provider' => 'claude', 'accountRef' => 'default',
            'model' => 'claude-sonnet', 'capabilities' => ['controlledTools' => true]]);
    }

    private function hostRow(int $userId, string $hostId): array
    {
        return ['user_id' => $userId, 'host_id' => $hostId, 'name' => 'Mac', 'platform' => 'macos', 'registered_at' => now(),
            'created_at' => now(), 'updated_at' => now()];
    }

    public function test_registering_a_new_computer_survives_the_same_computer_registering_first(): void
    {
        $host = str_repeat('d', 64);
        $response = $this->losingTo('remote_hosts', $this->hostRow($this->user->id, $host), fn () => $this->registerHost($host));
        $response->assertCreated();
        $this->assertSame(1, DB::table('remote_hosts')->where('host_id', $host)->count());
        $this->assertSame(1, DB::table('agent_runtime_bindings')->where('host_id', $host)->whereNull('revoked_at')->count());
    }

    public function test_a_computer_that_another_account_registered_first_is_still_refused(): void
    {
        $host = str_repeat('e', 64);
        $other = \App\Models\User::factory()->create();
        $this->losingTo('remote_hosts', $this->hostRow($other->id, $host), fn () => $this->registerHost($host))
            ->assertStatus(409)->assertJsonPath('code', 'host_unavailable');
        $this->assertSame(0, DB::table('agent_runtime_bindings')->where('host_id', $host)->count());
    }

    public function test_a_grant_is_refused_for_a_connection_revoked_after_it_was_loaded_and_repeat_grants_stay_one_row(): void
    {
        $id = $this->gmailInstall('owner@example.com');
        $stale = Connection::query()->findOrFail($id);
        $grants = app(Grants::class);
        $grants->put($this->user->id, $this->agent['id'], $stale, ['gmail_read']);
        $grants->put($this->user->id, $this->agent['id'], $stale, ['gmail_read']);
        $this->assertSame(1, DB::table('agent_grants')->where('connection_id', $id)->whereNull('revoked_at')->count());
        DB::table('agent_connections')->where('id', $id)->update(['revoked_at' => now(), 'health' => 'revoked']);
        try {
            $grants->put($this->user->id, $this->agent['id'], $stale, ['gmail_read', 'gmail_search']);
            $this->fail('A grant was written for a revoked connection.');
        } catch (HttpResponseException $e) {
            $this->assertSame(409, $e->getResponse()->getStatusCode());
            $this->assertSame('connection_revoked', $e->getResponse()->getData(true)['code']);
        }
    }

    public function test_the_hourly_trigger_cap_counts_admissions_still_in_flight(): void
    {
        $id = $this->postJson('/api/agents/v2/triggers', ['agentId' => $this->agent['id'], 'kind' => 'github.issue', 'ratePerHour' => 2,
            'filter' => ['repository' => 'acme/app', 'actions' => ['opened']], 'promptTemplate' => 'Triage.'])->assertCreated()->json('trigger.id');
        $trigger = Trigger::query()->findOrFail($id);
        // Another delivery's event is committed but its run is not admitted yet: it already holds one slot.
        TriggerEvent::query()->create(['trigger_id' => $id, 'user_id' => $this->user->id, 'event_key' => 'github:in-flight',
            'event_type' => 'github.issue', 'summary' => [], 'state' => 'pending']);
        $intake = app(TriggerIntake::class);
        [$first] = $intake->receive($trigger, 'github:one-00000001', 'github.issue', ['n' => 1]);
        [$second] = $intake->receive($trigger, 'github:two-00000002', 'github.issue', ['n' => 2]);
        $this->assertSame('admitted', $first->state);
        $this->assertSame(['skipped', 'rate_limited'], [$second->state, $second->reason]);
    }

    /** Lock order is run → action everywhere; on Postgres action → run deadlocked with a concurrent cancel (harness: approvals scenario). */
    public function test_approving_and_dispatching_lock_the_run_before_the_action(): void
    {
        $connection = $this->gmailInstall('owner@example.com');
        $this->grant($connection, ['gmail_read', 'gmail_search', 'gmail_send']);
        $this->fakeGmail(['gmail-token-a' => []]);
        $this->admit('Email the board.');
        $action = $this->callTool($this->claim(), 'gmail_send', $connection, ['to' => 'b@example.com', 'subject' => 'S', 'body' => 'B'], 'send-1')
            ->assertOk()->assertJsonPath('action.state', 'pending_approval')->json('action');
        $order = function (callable $act): array {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $act();
            $sql = array_column(DB::getQueryLog(), 'query');
            DB::disableQueryLog();
            $first = fn (string $pattern) => collect($sql)->search(fn ($q) => preg_match($pattern, $q) === 1);
            return [$first('/^select \* from "agent_runs" where "agent_runs"\."id" = \?/'), $first('/^select \* from "agent_tool_actions" where "agent_tool_actions"\."id" = \?/')];
        };
        $action['fingerprint'] = DB::table('agent_tool_actions')->where('id', $action['id'])->value('fingerprint'); // the runner's view no longer carries it
        [$run, $locked] = $order(fn () => $this->decide($action)->assertOk());
        $this->assertNotFalse($run);
        $this->assertLessThan($locked, $run, 'decide() locked the action before the run.');
        DB::table('agent_tool_actions')->where('id', $action['id'])->update(['state' => 'approved']);
        [$run, $locked] = $order(fn () => app(Approvals::class)->dispatch($action['id']));
        $this->assertNotFalse($run);
        $this->assertLessThan($locked, $run, 'dispatch() locked the action before the run.');
    }

    /** A new identity has no row to lock, so adding an account serializes on the user row first (duplicates: harness, 8 of 8 callers). */
    public function test_adding_an_account_takes_the_user_lock_before_looking_for_the_identity_and_reuses_one_connection(): void
    {
        $this->route('GET', '#api\.github\.com/user#', Http::response(['login' => 'octocat']));
        $connections = app(\App\Services\AgentRuns\Connections\Connections::class);
        DB::flushQueryLog();
        DB::enableQueryLog();
        $first = $connections->addAccount($this->user->id, 'github', 'ghp_one');
        $sql = array_column(DB::getQueryLog(), 'query');
        DB::disableQueryLog();
        $at = fn (string $pattern) => collect($sql)->search(fn ($q) => preg_match($pattern, $q) === 1);
        $user = $at('/^select \* from "users" where "id" = \?/');
        $identity = $at('/^select \* from "agent_connections" where "user_id" = \?/');
        $this->assertNotFalse($user, 'The user row was never locked.');
        $this->assertLessThan($identity, $user, 'The identity lookup ran before the user lock.');
        $second = $connections->addAccount($this->user->id, 'github', 'ghp_two');
        $this->assertSame($first->id, $second->id);
        $this->assertSame(2, $second->fresh()->generation);
        $this->assertSame(1, DB::table('agent_connections')->where('user_id', $this->user->id)->where('provider', 'github')->count());
    }
}
