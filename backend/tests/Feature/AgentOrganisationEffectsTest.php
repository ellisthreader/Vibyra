<?php
namespace Tests\Feature;
use App\Models\OrganizationMember;
use App\Services\AgentOrganizations\{Authority, Instances, Maintenance, Policies};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\Support\{AgentOrganisationFixture, AgentV2BrowserFixture, AgentV2Routes};
use Tests\TestCase;
final class AgentOrganisationEffectsTest extends TestCase
{
    use RefreshDatabase, AgentOrganisationFixture, AgentV2BrowserFixture, AgentV2Routes;
    protected function setUp(): void { parent::setUp(); $this->bootOrganisation(); }
    public function test_provider_narrowing_removes_tools_and_refuses_previously_approved_write(): void
    {
        $connection = $this->gmailInstall('owner@example.com'); $this->grant($connection, ['gmail_search', 'gmail_send']);
        $this->fakeGmail(['gmail-token-a' => []]); $this->admit('Email a report'); $claimed = $this->claim();
        $action = $this->callTool($claimed, 'gmail_send', $connection,
            ['to' => 'fixture@example.com', 'subject' => 'Report', 'body' => 'Private text'], 'mail')->assertOk()->json('action');
        Policies::save($this->user->id, ['expectedRevision' => 1, 'enabled' => true,
            'allowedProviders' => ['github'], 'dailyTaskLimit' => 25, 'retentionDays' => 90]);
        $this->decide($action)->assertOk()->assertJsonPath('action.state', 'refused');
        $this->callTool($claimed, 'gmail_search', $connection, ['query' => 'anything'], 'after-policy')
            ->assertOk()->assertJsonPath('action.result.reason', 'organisation_provider_denied');
        Http::assertNothingSent();
    }
    public function test_real_late_browser_receipt_survives_offboarding_but_heartbeat_does_not(): void
    {
        $conn = $this->bootBrowser(); $this->admit('Submit a form'); $claimed = $this->claim(); $fp = str_repeat('a', 64);
        $snapshot = $this->callTool($claimed, 'browser_snapshot', $conn, [], 'snapshot')->assertOk()->json('action');
        $this->browserRun($claimed, $snapshot, $this->page($fp))->assertOk();
        $submit = $this->callTool($claimed, 'browser_submit', $conn, ['ref' => 'e3', 'pageFingerprint' => $fp], 'submit')->assertOk()->json('action');
        $this->decide($submit)->assertOk(); $this->browserClaim($claimed, $submit)->assertOk();
        OrganizationMember::where('user_id', $this->user->id)->delete(); $this->assertSame(1, Maintenance::stopRevoked());
        $this->browserReceipt($claimed, $submit['id'], ['url' => 'https://shop.example.com/sent', 'title' => 'Sent', 'submitted' => true,
            'destination' => 'https://shop.example.com/send', 'observed' => ['method' => 'POST', 'destination' => 'https://shop.example.com/send']])
            ->assertOk()->assertJsonPath('action.state', 'completed');
        $this->postJson($this->runnerPath('/runs/'.$claimed['id'].'/heartbeat'), ['generation' => $claimed['generation']],
            $this->runnerHeaders())->assertConflict();
        $this->assertDatabaseHas('agent_receipts', ['action_id' => $submit['id'], 'status' => 'confirmed']);
        $this->assertDatabaseHas('agent_runs', ['id' => $claimed['id'], 'state' => 'cancelled']);
    }
    public function test_shared_instance_refuses_legacy_execution_and_mixed_groups(): void
    {
        $personal = DB::table('agent_teammates')->where('user_id', $this->user->id)->where('id', '!=', $this->agent['id'])->value('id');
        try { Instances::groupScope([$personal, $this->agent['id']]); $this->fail('Mixed scope accepted'); }
        catch (\Illuminate\Http\Exceptions\HttpResponseException $e) { $this->assertSame(409, $e->getResponse()->getStatusCode()); }
        $this->expectException(\Illuminate\Http\Exceptions\HttpResponseException::class);
        \App\Services\Agents\TaskContext::forChat((object) ['agent_id' => $this->agent['id'], 'user_id' => $this->user->id]);
    }
    public function test_discovery_refuses_revoked_membership_and_restricted_provider(): void
    {
        Authority::discovery($this->agent['id'], $this->user->id, 'gmail');
        try { Authority::discovery($this->agent['id'], $this->user->id, 'slack'); $this->fail('Restricted provider accepted'); }
        catch (\Illuminate\Http\Exceptions\HttpResponseException $e) { $this->assertSame('organisation_provider_denied', $e->getResponse()->getData(true)['code']); }
        OrganizationMember::where('user_id', $this->user->id)->delete();
        $this->expectException(\Illuminate\Http\Exceptions\HttpResponseException::class);
        Authority::discovery($this->agent['id'], $this->user->id, 'gmail');
    }
}
