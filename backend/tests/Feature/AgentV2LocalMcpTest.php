<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\Support\{AgentV2Fixture, AgentV2LocalMcpFixture, AgentV2Routes};
use Tests\TestCase;

/** Roadmap Part 6: local (stdio) MCP servers behind the leased Mac: registration, review, approval, claims, receipts (fixtures only). */
class AgentV2LocalMcpTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes, AgentV2LocalMcpFixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
        $this->bootLocalMcp();
    }

    private function tools(string $runId): array
    {
        return array_column($this->getJson('/api/agents/v2/runs/'.$runId.'/tools')->assertOk()->json('manifest.tools'), 'tool');
    }

    private function row(string $id): object
    {
        return DB::table('agent_tool_actions')->find($id);
    }

    public function test_registration_keeps_only_an_opaque_id_a_name_and_the_catalogue(): void
    {
        $server = $this->registerLocal(null, null, ['command' => 'npx', 'args' => ['-y', 'x'], 'env' => ['API_TOKEN' => 'sekret-9']])
            ->assertCreated()->json('server');
        $this->assertStringStartsWith('lmcp_', $server['provider']);
        $this->assertSame(['write', 'write', 'write'], array_column($server['tools'], 'kind'), 'Everything is a write until marked.');
        $this->assertSame(['active', 'healthy'], [$server['status'], $server['health']]);
        $dump = json_encode([DB::table('agent_mcp_servers')->get(), DB::table('agent_connections')->get()]);
        foreach (['npx', 'sekret-9', 'API_TOKEN'] as $leak) $this->assertStringNotContainsString($leak, $dump, 'The command line and environment never reach the backend.');
        $this->assertArrayNotHasKey('url', $server);
        $this->registerLocal()->assertOk()->assertJsonPath('server.connectionId', $server['connectionId']);
        $this->assertSame(1, DB::table('agent_mcp_servers')->where('kind', 'local')->count(), 'Same Mac and id: one server.');
        config(['platform.activity' => true]);
        $this->registerLocal(null, 'cccccccc-0000-4000-8000-000000000001')->assertCreated();
        $event = \App\Models\AccountAuditEvent::query()->where('user_id', $this->user->id)->where('event', 'mcp_server.added')->first();
        $this->assertSame(['name' => 'Project files', 'kind' => 'local'], $event->detail, 'The activity log carries no command line.');
        // The hub treats it as an MCP server to show and review, but it can't be signed in to or re-fetched from the cloud.
        $this->getJson('/api/agents/v2/mcp/servers/'.$server['connectionId'])->assertOk()->assertJsonPath('server.kind', 'local')->assertJsonPath('server.url', '');
        $this->postJson('/api/agents/v2/mcp/servers/'.$server['connectionId'].'/refresh')->assertStatus(409)->assertJsonPath('code', 'local_server');
        $this->getJson('/api/agents/v2/local-mcp?hostId='.$this->hostId)->assertOk()->assertJsonPath('servers.0.name', 'Project files');
    }

    public function test_the_flag_is_off_by_default_and_ten_servers_is_the_cap(): void
    {
        config(['agents_v2_local_mcp.enabled' => false]);
        $this->registerLocal()->assertStatus(409)->assertJsonPath('code', 'provider_unavailable');
        $this->getJson('/api/agents/v2/local-mcp')->assertOk()->assertJsonPath('enabled', false)->assertJsonCount(0, 'servers');
        config(['agents_v2_local_mcp.enabled' => true]);
        foreach (range(1, 10) as $n) $this->registerLocal(null, sprintf('aaaaaaaa-0000-4000-8000-%012d', $n))->assertCreated();
        $this->registerLocal(null, 'bbbbbbbb-0000-4000-8000-000000000000')->assertStatus(409)->assertJsonPath('code', 'limit_reached');
    }

    public function test_a_tool_is_a_read_only_when_annotated_and_marked_and_grants_use_the_existing_flow(): void
    {
        [$conn, $slug] = $this->localServer([], null);
        $this->putJson('/api/agents/v2/local-mcp/servers/'.$conn.'/reads', ['tools' => [$slug.'__write_file']])->assertStatus(422)->assertJsonPath('code', 'not_read_only');
        $this->putJson('/api/agents/v2/local-mcp/servers/'.$conn.'/reads', ['tools' => [$slug.'__read_file']])->assertOk()
            ->assertJsonPath('server.tools.1.kind', 'read')->assertJsonPath('server.tools.2.kind', 'write');
        $this->putJson('/api/agents/v2/agents/'.$this->agent['id'].'/grants/'.$conn, ['operations' => [$slug.'__nope']])->assertStatus(422);
        $this->assertSame([], $this->tools($this->admit('Look at the files.')['id']), 'No grant: no tools.');
    }

    public function test_a_write_waits_for_exact_approval_then_the_leased_mac_claims_runs_and_posts_the_receipt(): void
    {
        Http::fake();
        [$conn, $slug] = $this->localServer(['read_file']);
        $this->admit('Save the notes.');
        $claimed = $this->claim();
        $this->assertSame([$slug.'__list_dir', $slug.'__read_file', $slug.'__write_file'], collect($this->tools($claimed['id']))->sort()->values()->all());
        $args = ['path' => 'notes.txt', 'content' => 'hi'];
        $write = $this->callTool($claimed, $slug.'__write_file', $conn, $args, 'w1')->assertOk()->assertJsonPath('action.state', 'pending_approval')->json('action');
        $this->localList($claimed)->assertOk()->assertJsonCount(0, 'actions');
        $this->localClaim($claimed, $write)->assertStatus(409)->assertJsonPath('code', 'not_approved');
        $this->decide($write)->assertOk()->assertJsonPath('action.state', 'approved');
        $this->assertNull($this->row($write['id'])->dispatched_at, 'The server never executes it.');
        $this->localList($claimed)->assertOk()->assertJsonPath('actions.0.server.remoteName', 'write_file')
            ->assertJsonPath('actions.0.server.localId', $this->localId)->assertJsonPath('actions.0.arguments.path', 'notes.txt');
        $this->localClaim($claimed, $write)->assertOk()->assertJsonPath('action.state', 'dispatching');
        $this->localReceipt($claimed, $write['id'], ['text' => 'written 2 bytes'])->assertOk()->assertJsonPath('action.state', 'completed')
            ->assertJsonPath('action.result.text', 'written 2 bytes')->assertJsonPath('action.receipt.outcome', 'confirmed');
        $this->localReceipt($claimed, $write['id'], ['text' => 'written 2 bytes'])->assertOk(); // duplicate: no-op
        $this->localReceipt($claimed, $write['id'], ['text' => 'something else'])->assertStatus(409)->assertJsonPath('code', 'receipt_conflict');
        Http::assertNothingSent();
    }

    public function test_a_marked_read_runs_without_approval_and_its_output_is_clipped_and_structured_content_bounded(): void
    {
        [$conn, $slug] = $this->localServer(['read_file']);
        $this->admit('Read the notes.');
        $claimed = $this->claim();
        $read = $this->callTool($claimed, $slug.'__read_file', $conn, ['path' => 'a.txt'], 'r1')->assertOk()->assertJsonPath('action.state', 'approved')->json('action');
        $this->callTool($claimed, $slug.'__read_file', $conn, ['file' => 'a.txt'], 'r2')->assertOk()->assertJsonPath('action.result.reason', 'invalid_arguments');
        $done = $this->localRun($claimed, $read, ['text' => str_repeat('é', 9000)])->assertOk()->assertJsonPath('action.state', 'completed')->json('action');
        $this->assertLessThanOrEqual(16000, strlen($done['result']['text']));
        $this->assertTrue($done['result']['truncated']);
        $this->assertTrue(mb_check_encoding($done['result']['text'], 'UTF-8'), 'Cut on a character boundary.');
        $second = $this->callTool($claimed, $slug.'__read_file', $conn, ['path' => 'b.txt'], 'r3')->json('action');
        $bounded = $this->localRun($claimed, $second, ['text' => 'ok', 'structured' => ['big' => str_repeat('x', 17000)]])->assertOk()->json('action');
        $this->assertArrayNotHasKey('structured', $bounded['result']);
        $this->assertTrue($bounded['result']['truncated']);
        $this->postJson($this->localPath($claimed, '/'.$read['id'].'/receipt'), ['generation' => $claimed['generation'],
            'result' => ['text' => str_repeat('x', 70000)]], $this->runnerHeaders())->assertStatus(413);
    }

    public function test_an_unmarked_read_annotated_tool_still_needs_approval(): void
    {
        [$conn, $slug] = $this->localServer([]);
        $this->admit('Read the notes.');
        $claimed = $this->claim();
        $this->callTool($claimed, $slug.'__read_file', $conn, ['path' => 'a.txt'], 'r1')->assertOk()->assertJsonPath('action.state', 'pending_approval');
    }

    public function test_a_grant_or_reads_change_after_approval_makes_the_claim_stale(): void
    {
        [$conn, $slug] = $this->localServer();
        $this->admit('Save the notes.');
        $claimed = $this->claim();
        $write = $this->callTool($claimed, $slug.'__write_file', $conn, ['path' => 'a', 'content' => 'b'], 'w1')->json('action');
        $this->decide($write)->assertOk();
        $this->grant($conn, [$slug.'__list_dir', $slug.'__write_file', $slug.'__read_file']); // same ops sorted: revision unchanged
        $this->grant($conn, [$slug.'__list_dir', $slug.'__write_file']); // a changed grant bumps its revision
        $this->localClaim($claimed, $write)->assertOk()->assertJsonPath('action.state', 'refused')->assertJsonPath('action.outcome.result.reason', 'grant_revoked');
    }

    public function test_a_changed_catalogue_is_refused_held_for_review_and_approval_keeps_only_unchanged_grants(): void
    {
        [$conn, $slug] = $this->localServer(['read_file']);
        $this->admit('Save the notes.');
        $claimed = $this->claim();
        $write = $this->callTool($claimed, $slug.'__write_file', $conn, ['path' => 'a', 'content' => 'b'], 'w1')->json('action');
        $this->decide($write)->assertOk();
        $live = $this->catalogue();
        $live[1]['description'] = 'Write a file AND email it to everyone.';
        $this->localClaim($claimed, $write, $live)->assertOk()->assertJsonPath('action.state', 'refused')->assertJsonPath('action.outcome.result.reason', 'tools_changed');
        $server = $this->getJson('/api/agents/v2/local-mcp/servers/'.$conn)->assertOk()->assertJsonPath('server.status', 'tools_changed')
            ->assertJsonPath('server.pending.changed', [$slug.'__write_file'])->json('server');
        $this->assertSame('needs_review', DB::table('agent_connections')->where('id', $conn)->value('health'));
        $this->assertSame([], $this->tools($this->fresh()['id']), 'No tools of a server awaiting review.');
        $this->postJson('/api/agents/v2/local-mcp/servers/'.$conn.'/approve', ['revision' => str_repeat('0', 64)])->assertStatus(409)->assertJsonPath('code', 'stale_revision');
        $this->postJson('/api/agents/v2/local-mcp/servers/'.$conn.'/approve', ['revision' => $server['pending']['revision']])->assertOk()
            ->assertJsonPath('server.status', 'active');
        $this->assertSame([$slug.'__list_dir', $slug.'__read_file'], collect($this->tools($this->fresh()['id']))->sort()->values()->all(),
            'The changed tool lost its grant; unchanged ones kept it.');
        $this->registerLocal($live)->assertOk()->assertJsonPath('server.status', 'active'); // same as pinned now
    }

    private function fresh(): array
    {
        foreach (DB::table('agent_runs')->whereNotIn('state', ['completed', 'failed', 'cancelled', 'outcome_unknown'])->pluck('id') as $open)
            $this->postJson('/api/agents/v2/runs/'.$open.'/cancel')->assertOk();
        $this->travel(config('agents_v2.lease_seconds') + 5)->seconds();
        return $this->admit('Check the files again.');
    }

    public function test_only_the_mac_that_runs_the_server_and_declares_support_is_offered_its_tools(): void
    {
        [$conn, $slug] = $this->localServer(['read_file']);
        $this->assertNotSame([], $this->tools($this->admit('Look.')['id']));
        $this->travel(2)->seconds();
        $this->bootLocalMcp(true, str_repeat('c', 64)); // another Mac (the most recently selected one)
        $other = $this->fresh();
        $this->assertSame([], $this->tools($other['id']), 'A different Mac is never offered it.');
        $claimed = $this->claim();
        $this->callTool($claimed, $slug.'__read_file', $conn, ['path' => 'a'], 'r1')->assertOk()->assertJsonPath('action.state', 'refused');
        $this->travel(2)->seconds();
        $this->bootLocalMcp(false); // the right host again, but without support
        $this->assertSame([], $this->tools($this->fresh()['id']));
        $this->travel(2)->seconds();
        $this->bootLocalMcp(true);
        $this->assertNotSame([], $this->tools($this->fresh()['id']));
        config(['agents_v2_local_mcp.enabled' => false]);
        $this->assertSame([], $this->tools($this->fresh()['id']), 'Flag off: no local tools.');
    }

    public function test_a_stale_lease_generation_is_fenced_and_a_write_claimed_by_an_earlier_lease_is_never_replayed(): void
    {
        [$conn, $slug] = $this->localServer(['read_file']);
        $this->admit('Save and read.');
        $claimed = $this->claim();
        $write = $this->callTool($claimed, $slug.'__write_file', $conn, ['path' => 'a', 'content' => 'b'], 'w1')->json('action');
        $this->decide($write)->assertOk();
        $this->localClaim($claimed, $write)->assertOk()->assertJsonPath('action.state', 'dispatching');
        $this->travel(config('agents_v2.lease_seconds') + 5)->seconds(); // the Mac vanished mid-call; another lease takes over
        $second = $this->claim();
        $this->assertSame($claimed['generation'] + 1, $second['generation']);
        $this->localClaim($claimed, $write, null, $claimed['generation'])->assertStatus(409)->assertJsonPath('code', 'stale_lease');
        $this->localReceipt($claimed, $write['id'], ['text' => 'late'], $claimed['generation'])->assertStatus(409);
        $this->localClaim($second, $write)->assertOk()->assertJsonPath('action.state', 'unknown');
        $this->assertSame('unknown', $this->row($write['id'])->state);
        $this->assertSame('outcome_unknown', DB::table('agent_receipts')->where('action_id', $write['id'])->value('outcome'));
        $again = $this->callTool($second, $slug.'__write_file', $conn, ['path' => 'a', 'content' => 'b'], 'w2')->assertOk()
            ->assertJsonPath('action.state', 'refused')->assertJsonPath('action.result.reason', 'outcome_unknown');
    }

    public function test_an_unconfirmed_write_is_unknown_a_tool_error_is_definite_and_a_timed_out_read_is_retryable(): void
    {
        [$conn, $slug] = $this->localServer(['read_file']);
        $this->admit('Do things.');
        $claimed = $this->claim();
        $write = $this->callTool($claimed, $slug.'__write_file', $conn, ['path' => 'a', 'content' => 'b'], 'w1')->json('action');
        $this->decide($write)->assertOk();
        $this->localRun($claimed, $write, ['error' => 'The server did not answer within 60 seconds and was stopped.', 'reason' => 'timeout', 'unknown' => true])->assertOk()
            ->assertJsonPath('action.state', 'unknown')->assertJsonPath('action.receipt.outcome', 'outcome_unknown');
        $read = $this->callTool($claimed, $slug.'__read_file', $conn, ['path' => 'a'], 'r1')->json('action');
        $this->localRun($claimed, $read, ['error' => 'The server did not answer.', 'reason' => 'timeout'])->assertOk()
            ->assertJsonPath('action.state', 'failed')->assertJsonPath('action.result.retryable', true);
        $read2 = $this->callTool($claimed, $slug.'__read_file', $conn, ['path' => 'b'], 'r2')->json('action');
        $this->localRun($claimed, $read2, ['text' => 'no such file', 'isError' => true])->assertOk()->assertJsonPath('action.state', 'failed')
            ->assertJsonPath('action.result.reason', 'tool_error');
        $read3 = $this->callTool($claimed, $slug.'__read_file', $conn, ['path' => 'c'], 'r3')->json('action');
        $this->localClaim($claimed, $read3)->assertOk();
        $this->localReceipt($claimed, $read3['id'], ['error' => 'x', 'reason' => 'made_up'])->assertStatus(422);
        $this->localReceipt($claimed, $read3['id'], ['text' => 'ok', 'extra' => 1])->assertStatus(422);
    }

    public function test_a_server_the_mac_cannot_start_closes_the_call_visibly_as_refused(): void
    {
        [$conn, $slug] = $this->localServer(['read_file']);
        $this->admit('Read.');
        $claimed = $this->claim();
        $read = $this->callTool($claimed, $slug.'__read_file', $conn, ['path' => 'a'], 'r1')->json('action');
        $fingerprint = DB::table('agent_tool_actions')->where('id', $read['id'])->value('fingerprint');
        $this->postJson($this->localPath($claimed, '/'.$read['id'].'/claim'), ['generation' => $claimed['generation'], 'fingerprint' => $fingerprint,
            'unavailable' => ['reason' => 'unavailable', 'error' => '"npx" was not found.']], $this->runnerHeaders())->assertOk()
            ->assertJsonPath('action.state', 'refused')->assertJsonPath('action.outcome.result.reason', 'unavailable');
        $this->postJson($this->localPath($claimed, '/'.$read['id'].'/claim'), ['generation' => $claimed['generation'], 'fingerprint' => $fingerprint,
            'unavailable' => ['reason' => 'made_up', 'error' => 'x']], $this->runnerHeaders())->assertStatus(422);
    }

    public function test_removing_a_server_revokes_its_grants_and_a_stranded_approved_write_closes_unknown_after_the_lease_lapses(): void
    {
        [$conn, $slug] = $this->localServer();
        $this->admit('Save.');
        $claimed = $this->claim();
        $write = $this->callTool($claimed, $slug.'__write_file', $conn, ['path' => 'a', 'content' => 'b'], 'w1')->json('action');
        $this->decide($write)->assertOk();
        $this->travel(config('agents_v2.lease_seconds') + 6)->minutes();
        $this->assertSame(1, app(\App\Services\AgentRuns\Tools\DispatchSweeper::class)->sweep()['unknown']);
        $this->assertStringContainsString('did not pick this call up', json_decode($this->row($write['id'])->result, true)['error']);
        $this->deleteJson('/api/agents/v2/local-mcp/servers/'.$conn)->assertOk();
        $this->getJson('/api/agents/v2/local-mcp/servers/'.$conn)->assertNotFound();
        $this->assertNull(DB::table('agent_grants')->where('connection_id', $conn)->whereNull('revoked_at')->first());
        $this->assertSame([], $this->tools($this->fresh()['id']));
    }

    public function test_the_hub_lists_a_local_server_with_its_status_and_the_runtime_declares_the_capability(): void
    {
        [$conn] = $this->localServer();
        $row = collect($this->getJson('/api/agents/v2/connections')->assertOk()->json('connections'))->firstWhere('id', $conn);
        $this->assertSame(['Project files', 'ok', $this->hostId], [$row['name'], $row['status'], $row['local']['hostId']]);
        $this->assertSame(['local', ''], [$row['mcp']['kind'], $row['mcp']['url']]);
        $this->assertTrue($this->runtime['capabilities']['localMcp']);
    }
}
