<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\{AgentV2BrowserFixture, AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/** Phase 7 browser tools on the V2 engine: grant, site policy, exact submit approval, stale pages (fixtures only). */
class AgentV2BrowserToolsTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes, AgentV2BrowserFixture;

    private const ALL = ['browser_click', 'browser_open', 'browser_read', 'browser_snapshot', 'browser_submit',
        'browser_takeover_request', 'browser_type'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
    }

    private function fresh(string $prompt = 'Check the shop.'): array
    {
        foreach (DB::table('agent_runs')->whereNotIn('state', ['completed', 'failed', 'cancelled', 'outcome_unknown'])->pluck('id') as $open)
            $this->postJson('/api/agents/v2/runs/'.$open.'/cancel')->assertOk();
        $this->travel(config('agents_v2.lease_seconds') + 5)->seconds();
        return $this->admit($prompt);
    }

    public function test_no_grant_no_flag_or_no_browser_mac_means_no_browser_tools(): void
    {
        $this->bootBrowser(true, []);
        $this->getJson('/api/agents/v2/agents/'.$this->agent['id'].'/browser')->assertOk()->assertJsonPath('browser', null);
        $this->assertSame([], $this->toolList($this->admit('Open the shop.')['id']), 'No grant: no browser tools.');
        foreach (['http://localhost:3000', 'https://10.0.0.5', 'https://169.254.169.254', 'https://shop.example.com/cart',
            'https://metadata.google.internal', 'https://printer.local', 'ftp://example.com'] as $bad)
            $this->browserSites([$bad])->assertStatus(422);
        $conn = $this->browserSites(['shop.example.com', 'https://shop.example.com:443/'])->assertOk()
            ->assertJsonPath('browser.origins', ['https://shop.example.com'])->json('browser.connectionId');
        $this->assertSame(self::ALL, $this->toolList($this->fresh()['id']));
        $this->putJson('/api/agents/v2/agents/'.$this->agent['id'].'/grants/'.$conn, ['operations' => ['browser_open']])
            ->assertStatus(409)->assertJsonPath('code', 'browser_grant_sites');
        config(['agents_v2_browser.enabled' => false]);
        $this->assertSame([], $this->toolList($this->fresh()['id']), 'Flag off: no browser tools.');
        config(['agents_v2_browser.enabled' => true]);
        $this->registerRuntime('acct-2'); // Re-registered without browserTools.
        $this->assertSame([], $this->toolList($this->fresh()['id']), 'A Mac without browser support gets none.');
        $this->bootBrowser(true, []);
        $this->deleteJson('/api/agents/v2/agents/'.$this->agent['id'].'/browser')->assertOk();
        $this->assertSame([], $this->toolList($this->fresh()['id']), 'Removed grant: no browser tools.');
    }

    public function test_an_origin_outside_the_grant_is_refused_and_an_allowed_open_runs_on_the_mac(): void
    {
        $conn = $this->bootBrowser();
        $this->admit('Open the shop.');
        $claimed = $this->claim();
        $this->callTool($claimed, 'browser_open', $conn, ['url' => 'https://evil.example.net/'], 'o0')->assertOk()
            ->assertJsonPath('action.state', 'refused')->assertJsonPath('action.result.reason', 'origin_not_allowed');
        $this->callTool($claimed, 'browser_open', $conn, ['url' => 'file:///etc/passwd'], 'o1')->assertOk()
            ->assertJsonPath('action.result.reason', 'invalid_arguments');
        $open = $this->callTool($claimed, 'browser_open', $conn, ['url' => 'https://shop.example.com/contact'], 'o2')->assertOk()
            ->assertJsonPath('action.state', 'approved')->json('action');
        $listed = $this->getJson($this->browserPath($claimed, '?generation='.$claimed['generation']), $this->runnerHeaders())
            ->assertOk()->assertJsonPath('actions.0.browser.origins', ['https://shop.example.com'])->json('actions.0');
        $this->browserClaim($claimed, $listed)->assertOk();
        $this->browserReceipt($claimed, $open['id'], ['url' => 'https://evil.example.net/'] + $this->page(str_repeat('a', 64), 'x@example.com', 'hunter2'))
            ->assertStatus(422);
        $done = $this->browserReceipt($claimed, $open['id'], $this->page(str_repeat('a', 64), 'x@example.com', 'hunter2'))->assertOk()
            ->assertJsonPath('action.state', 'completed')->assertJsonPath('action.receipt.url', 'https://shop.example.com/contact')
            ->json('action');
        $this->assertSame('[hidden]', $done['result']['forms'][0]['fields'][1]['value'], 'Password values never reach the model.');
        $this->assertSame('[hidden]', $done['result']['elements'][1]['value']);
        $this->assertStringNotContainsString('hunter2', DB::table('agent_tool_actions')->where('id', $open['id'])->value('result'));
    }

    public function test_a_submit_waits_for_exact_approval_of_page_fields_and_destination(): void
    {
        $conn = $this->bootBrowser();
        $this->admit('Send the contact form.');
        $claimed = $this->claim();
        $fp = str_repeat('b', 64);
        $snap = $this->callTool($claimed, 'browser_snapshot', $conn, [], 's1')->json('action');
        $this->browserRun($claimed, $snap, $this->page($fp))->assertOk();
        $submit = $this->callTool($claimed, 'browser_submit', $conn, ['ref' => 'e3', 'pageFingerprint' => $fp], 'w1')->assertOk()
            ->assertJsonPath('action.state', 'pending_approval')->json('action');
        $args = DB::table('agent_tool_actions')->where('id', $submit['id'])->value('arguments');
        $this->assertSame(['ref' => 'e3', 'pageFingerprint' => $fp, 'pageUrl' => 'https://shop.example.com/contact',
            'destination' => 'https://shop.example.com/send', 'method' => 'POST', 'submitLabel' => 'Send',
            'fields' => [['name' => 'to', 'label' => 'To', 'type' => 'email', 'value' => 'someone@example.com'],
                ['name' => 'pw', 'label' => 'Password', 'type' => 'password', 'value' => '[hidden]']]], json_decode($args, true));
        $this->getJson($this->browserPath($claimed, '?generation='.$claimed['generation']), $this->runnerHeaders())
            ->assertOk()->assertJsonCount(0, 'actions');
        $this->browserClaim($claimed, $submit)->assertStatus(409)->assertJsonPath('code', 'not_approved');
        $this->decide($submit)->assertOk()->assertJsonPath('action.state', 'approved');
        $this->browserClaim($claimed, $submit)->assertOk()->assertJsonPath('action.state', 'dispatching');
        $shot = str_repeat('c', 64);
        $this->browserReceipt($claimed, $submit['id'], ['url' => 'https://shop.example.com/sent', 'title' => 'Sent', 'submitted' => true,
            'destination' => 'https://shop.example.com/send', 'screenshotSha256' => $shot,
            'observed' => ['method' => 'POST', 'destination' => 'https://shop.example.com/send']])->assertOk()
            ->assertJsonPath('action.state', 'completed')->assertJsonPath('action.receipt.providerResourceId', $shot)
            ->assertJsonPath('action.receipt.url', 'https://shop.example.com/sent');
    }

    public function test_a_stale_page_or_changed_sites_need_a_fresh_snapshot_and_approval(): void
    {
        $conn = $this->bootBrowser();
        $this->admit('Send the contact form.');
        $claimed = $this->claim();
        $this->callTool($claimed, 'browser_submit', $conn, ['ref' => 'e3', 'pageFingerprint' => str_repeat('9', 64)], 'w0')
            ->assertOk()->assertJsonPath('action.state', 'refused')->assertJsonPath('action.result.reason', 'stale_page');
        $fp = str_repeat('b', 64);
        $snap = $this->callTool($claimed, 'browser_snapshot', $conn, [], 's1')->json('action');
        $this->browserRun($claimed, $snap, $this->page($fp))->assertOk();
        $submit = $this->callTool($claimed, 'browser_submit', $conn, ['ref' => 'e3', 'pageFingerprint' => $fp], 'w1')->json('action');
        $this->decide($submit)->assertOk();
        // The live page changed after approval (e.g. another recipient): the Mac refuses before submitting.
        $this->browserRun($claimed, $submit, ['error' => 'The page changed since it was approved.', 'reason' => 'page_changed'])
            ->assertOk()->assertJsonPath('action.state', 'failed')->assertJsonPath('action.result.reason', 'page_changed');
        $again = $this->callTool($claimed, 'browser_submit', $conn, ['ref' => 'e3', 'pageFingerprint' => $fp], 'w2')->json('action');
        $this->decide($again)->assertOk();
        $this->browserSites(['https://shop.example.com', 'https://other.example.org'])->assertOk()->assertJsonPath('browser.generation', 2);
        $this->browserClaim($claimed, $again)->assertOk()->assertJsonPath('action.state', 'refused')
            ->assertJsonPath('action.outcome.result.reason', 'grant_revoked');
    }
}
