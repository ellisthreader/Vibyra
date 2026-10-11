<?php

namespace Tests\Feature;

use App\Services\Agents\ToolPolicy;
use App\Services\ChatConnectors\ConnectorOAuth;
use Illuminate\Support\Facades\Http;
use Tests\Support\OAuthHop;
use Tests\TestCase;

class AdditionalConnectorsTest extends TestCase
{
    use OAuthHop;

    public function test_notion_oauth_uses_json_basic_auth_and_owner_user(): void
    {
        config(['chat_connectors.enabled' => true,
            'chat_connectors.catalogue.notion.oauth.client_id' => 'notion-id',
            'chat_connectors.catalogue.notion.oauth.client_secret' => 'notion-secret']);
        $oauth = app(ConnectorOAuth::class);
        $start = $oauth->start(42, 'notion', null);
        [$provider, $nonce] = $this->openedFlow($start);
        $query = $this->queryOf($provider);
        $this->assertSame('user', $query['owner']);
        $this->assertArrayNotHasKey('scope', $query);
        Http::fake(['api.notion.com/v1/oauth/token' => Http::response([
            'access_token' => 'notion-access', 'refresh_token' => 'notion-refresh'])]);
        [$flow, $grant] = $oauth->finish('notion', $query['state'], 'code', '', $nonce);
        $this->assertSame(42, $flow['userId']);
        $this->assertSame('notion-refresh', $grant['refresh']);
        Http::assertSent(fn ($request) => $request->hasHeader('Authorization', 'Basic '.base64_encode('notion-id:notion-secret'))
            && $request->hasHeader('Content-Type', 'application/json')
            && $request['grant_type'] === 'authorization_code'
            && !isset($request['client_secret']));
        $oauth->renew('notion', 'notion-refresh');
        Http::assertSent(fn ($request) => $request['grant_type'] === 'refresh_token'
            && $request['refresh_token'] === 'notion-refresh'
            && !isset($request['client_id']));
    }

    public function test_slack_writes_are_approval_gated(): void
    {
        $policy = app(ToolPolicy::class);
        foreach (['slack' => ['slack_history', 'slack_post_message']] as $slug => [$read, $write]) {
            $this->assertFalse($policy->requiresApproval($slug, $read));
            $this->assertTrue($policy->requiresApproval($slug, $write));
        }
    }

}
