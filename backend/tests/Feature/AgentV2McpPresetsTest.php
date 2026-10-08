<?php

namespace Tests\Feature;

use App\Services\AgentRuns\Mcp\Discovery;
use App\Services\Mcp\EndpointPolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\AgentV2Fixture;
use Tests\TestCase;

/** The one-tap remote MCP presets in `GET /api/agents/v2/catalogue` (`mcpPresets`): gating, shape, and what must never be listed. */
class AgentV2McpPresetsTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
    }

    private function presets(): array
    {
        return $this->getJson('/api/agents/v2/catalogue')->assertOk()->json('mcpPresets');
    }

    public function test_the_list_is_empty_while_remote_mcp_is_off_and_the_providers_are_untouched(): void
    {
        config(['agents_v2_mcp.enabled' => false]);
        $body = $this->getJson('/api/agents/v2/catalogue')->assertOk()->assertJsonPath('mcpPresets', [])->json();
        $this->assertNotEmpty($body['providers'], 'The existing providers key is unchanged.');
    }

    public function test_the_list_is_empty_when_connections_are_off_even_if_the_mcp_flag_is_on(): void
    {
        config(['agents_v2_mcp.enabled' => true, 'chat_connectors.enabled' => false]);
        $this->assertSame([], $this->presets(), 'McpServers::add refuses in this state, so nothing may be offered.');
    }

    public function test_the_list_is_present_and_well_formed_when_remote_mcp_is_on(): void
    {
        config(['agents_v2_mcp.enabled' => true]);
        $presets = $this->presets();
        $this->assertGreaterThanOrEqual(10, count($presets));
        $this->assertLessThanOrEqual(20, count($presets));
        $policy = new EndpointPolicy(fn () => ['93.184.216.34']);
        $native = array_keys((array) config('chat_connectors.catalogue'));
        foreach ($presets as $p) {
            $this->assertSame(['category', 'id', 'name', 'native', 'tagline', 'url'], collect($p)->keys()->sort()->values()->all(), $p['id'] ?? '?');
            $this->assertMatchesRegularExpression('/^[a-z0-9_]{2,40}$/D', $p['id']);
            foreach (['name', 'category', 'tagline'] as $k) {
                $this->assertNotSame('', $p[$k], $p['id'].' '.$k);
                $this->assertSame(trim($p[$k]), $p[$k], $p['id'].' '.$k);
            }
            $this->assertLessThanOrEqual(60, mb_strlen($p['tagline']), $p['id'].' tagline');
            $this->assertStringStartsWith('https://', $p['url']);
            $this->assertSame($p['url'], Discovery::canonical($p['url']), $p['id'].' url is already canonical');
            $this->assertSame(443, $policy->pin($p['url'])['port'], $p['id'].' passes the destination policy');
            $this->assertTrue($p['native'] === null || in_array($p['native'], $native, true), $p['id'].' native slug exists');
        }
    }

    public function test_ids_names_and_urls_are_unique_and_the_order_leads_with_payments(): void
    {
        config(['agents_v2_mcp.enabled' => true]);
        $presets = $this->presets();
        foreach (['id', 'name', 'url'] as $k) $this->assertSame(count($presets), count(array_unique(array_column($presets, $k))), $k.' is unique');
        $this->assertSame(['paypal', 'stripe'], array_slice(array_column($presets, 'id'), 0, 2));
        $this->assertSame(['Payments', 'Payments'], array_slice(array_column($presets, 'category'), 0, 2));
        $this->assertSame('PayPal', $presets[0]['name']);
        $this->assertSame('https://mcp.paypal.com/mcp', $presets[0]['url'], 'The live PayPal endpoint, not the sandbox.');
    }

    public function test_services_that_need_a_pre_registered_app_or_an_allow_list_are_never_listed(): void
    {
        config(['agents_v2_mcp.enabled' => true]);
        $banned = ['slack', 'github', 'hubspot', 'pagerduty', 'box', 'render', 'docusign', 'vercel', 'figma', 'canva', 'intercom', 'monday', 'dropbox', 'zendesk', 'asana'];
        foreach ($this->presets() as $p) {
            $host = (string) parse_url($p['url'], PHP_URL_HOST);
            $this->assertNotContains($p['id'], $banned);
            $this->assertStringNotContainsString('/sse', $p['url'], $p['id'].' must be Streamable HTTP, not the legacy SSE transport');
            foreach (['slack.com', 'githubcopilot.com', 'github.com', 'hubspot.com', 'vercel.com', 'sandbox'] as $bad)
                $this->assertStringNotContainsString($bad, $host, $p['id']);
        }
    }
}
