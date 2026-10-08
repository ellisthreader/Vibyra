<?php
namespace Tests\Feature;

use App\Models\AgentV2\Connection;
use App\Services\AgentRuns\{Grants, Tools\ToolCatalog};
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\{Crypt, DB, Http};

final class AgentCloudDispatchTest extends AgentCloudTestCase
{
    public function test_external_dispatch_is_outside_authority_transaction_and_unknown_write_never_replays(): void
    {
        $p = $this->policy(); $key = $this->register($p)['runnerKey'];
        $connection = Connection::create(['user_id' => $this->user->id, 'provider' => 'github', 'external_identity' => 'Test account',
            'credential' => Crypt::encryptString('test-only'), 'health' => 'healthy', 'generation' => 1]);
        app(Grants::class)->put($this->user->id, $this->agentId, $connection, ['github_comment_issue', 'github_list_issues']);
        $r = $this->admit($p); $base = '/api/agents/v2/runner/'.$p['runtimeId']; $h = ['X-Vibyra-Runner-Key' => $key];
        $c = $this->postJson($base.'/claim', [], $h)->assertOk()->json('run');
        $baseline = DB::transactionLevel(); $observed = []; $reads = []; $sends = 0;
        Http::fake(function ($request) use (&$observed, &$reads, &$sends) {
            if ($request->method() === 'POST') {
                $sends++; $observed[] = DB::transactionLevel();
                $observed[] = DB::table('agent_tool_actions')->where('kind', 'write')->value('state');
                throw new ConnectionException('Synthetic lost response after provider accepted write');
            }
            $reads[] = DB::transactionLevel();
            return Http::response([]);
        });
        $this->postJson($base.'/runs/'.$r->id.'/tools', ['generation' => $c['generation'], 'callId' => 'cloud-read-one',
            'tool' => 'github_list_issues', 'connectionId' => $connection->id,
            'schemaRevision' => app(ToolCatalog::class)->schemaRevision('github_list_issues'), 'arguments' => ['repository' => 'qa-org/sandbox']], $h)->assertOk();
        $call = ['generation' => $c['generation'], 'callId' => 'cloud-write-one', 'tool' => 'github_comment_issue',
            'connectionId' => $connection->id, 'schemaRevision' => app(ToolCatalog::class)->schemaRevision('github_comment_issue'),
            'arguments' => ['repository' => 'qa-org/sandbox', 'number' => 12, 'body' => 'Test-only cloud receipt']];
        $first = $this->postJson($base.'/runs/'.$r->id.'/tools', $call, $h)->assertOk()->json('action');
        $this->assertSame('pending_approval', $first['state']);
        $fingerprint = DB::table('agent_tool_actions')->where('id', $first['id'])->value('fingerprint');
        $this->postJson('/api/agents/v2/actions/'.$first['id'].'/decision', ['decision' => 'allow', 'fingerprint' => $fingerprint])
            ->assertOk()->assertJsonPath('action.state', 'unknown');
        $this->assertNotEmpty($reads);
        $this->assertSame([$baseline], array_values(array_unique($reads)));
        $this->assertSame([$baseline, 'dispatching'], $observed, 'Dispatch intent must commit before provider I/O, without a Cloud controller transaction.');
        $this->postJson($base.'/runs/'.$r->id.'/tools', $call, $h)->assertOk()->assertJsonPath('action.state', 'unknown');
        $this->assertSame(1, $sends);
    }
}
