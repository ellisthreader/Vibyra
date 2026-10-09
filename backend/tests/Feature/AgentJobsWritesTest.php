<?php
namespace Tests\Feature;

use App\Models\AgentV2\{Run, ToolAction};
use App\Services\AgentRuns\Jobs\{AccountLock, ResourceClaims, ResourceKeys};
use Illuminate\Support\Facades\{DB, Http};

final class AgentJobsWritesTest extends AgentJobsTestCase
{
    private function writes(): array
    {
        $connection = $this->gmailInstall('owner@example.com'); $this->grant($connection, ['gmail_send']);
        $this->fakeGmail(['gmail-token-a' => []]);
        $this->job('write-a'); $this->job('write-b'); $a = $this->slot(0); $b = $this->slot(1);
        $body = ['to' => 'qa@example.com', 'subject' => 'Synthetic test', 'body' => 'No real email.'];
        $first = $this->callTool($a, 'gmail_send', $connection, $body, 'send-a')->assertOk()->json('action');
        $second = $this->callTool($b, 'gmail_send', $connection, $body, 'send-b')->assertOk()->json('action');
        return [$first, $second];
    }
    private function approve(array $action)
    {
        return $this->postJson('/api/agents/v2/actions/'.$action['id'].'/decision',
            ['fingerprint' => $this->fingerprintOf($action), 'decision' => 'allow'])->assertOk();
    }
    public function test_concurrent_write_preparation_cannot_overwrite_newer_resource_and_duplicate_approval_sends_once(): void
    {
        [$first, $second] = $this->writes();
        $this->approve($first)->assertJsonPath('action.state', 'completed');
        $this->approve($first)->assertJsonPath('action.state', 'completed');
        $this->approve($second)->assertJsonPath('action.state', 'refused')->assertJsonPath('action.result.reason', 'resource_changed');
        Http::assertSentCount(1);
    }
    public function test_unknown_write_keeps_resource_reserved_for_later_jobs(): void
    {
        [$first, $second] = $this->writes();
        $this->approve($first);
        ToolAction::whereKey($first['id'])->update(['state' => 'unknown']);
        $this->approve($second)->assertJsonPath('action.state', 'refused')->assertJsonPath('action.result.reason', 'resource_busy');
        Http::assertSentCount(1);
    }
    public function test_repository_key_ignores_account_grant_and_unrelated_resources_can_overlap(): void
    {
        [$first, $second] = $this->writes();
        $a = ToolAction::find($first['id']); $b = ToolAction::find($second['id']);
        $a->forceFill(['tool' => 'github_create_issue', 'arguments' => ['repository' => 'Acme/One']])->save();
        $b->forceFill(['tool' => 'github_create_issue', 'arguments' => ['repository' => 'acme/one']])->save();
        $otherGrant = $b->replicate()->forceFill(['connection_id' => (string) \Illuminate\Support\Str::uuid()]);
        $this->assertSame(ResourceKeys::key($a), ResourceKeys::key($otherGrant));
        $b->forceFill(['arguments' => ['repository' => 'acme/two']])->save();
        DB::transaction(function () use ($a, $b) {
            AccountLock::lock($this->user->id);
            $this->assertTrue(ResourceClaims::acquire(Run::find($a->run_id), $a));
            $a->forceFill(['state' => 'dispatching'])->save();
            $this->assertTrue(ResourceClaims::acquire(Run::find($b->run_id), $b));
        });
        Http::assertNothingSent();
    }
}
