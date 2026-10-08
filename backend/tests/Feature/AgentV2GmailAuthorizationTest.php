<?php

namespace Tests\Feature;

use App\Models\AgentV2\Connection;
use App\Services\AgentRuns\Connections\Connections;
use App\Services\ChatConnectors\ConnectorOAuth;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Crypt, Http};
use Tests\Support\{AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

class AgentV2GmailAuthorizationTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
        config(['chat_connectors.catalogue.gmail.oauth.client_id' => 'google-client',
            'chat_connectors.catalogue.gmail.oauth.client_secret' => 'google-client-secret']);
    }

    public function test_gmail_requests_only_its_documented_read_send_and_identity_scopes(): void
    {
        $settings = config('chat_connectors.catalogue.gmail.oauth');
        $this->assertEqualsCanonicalizing(['openid', 'email', 'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.send'], explode(' ', $settings['scope']));
        $this->assertTrue($settings['pkce']);
        $this->assertSame('offline', $settings['access_type']);
        $this->assertSame('consent', $settings['prompt']);
        $this->assertTrue(app(ConnectorOAuth::class)->configured('gmail'));
    }

    public function test_a_refresh_uses_and_updates_only_the_named_extra_account_and_keeps_its_refresh_token(): void
    {
        $work = $this->gmailInstall('work@example.com', 'work-token');
        Http::fake(['www.googleapis.com/oauth2/v3/userinfo' => Http::response(['email' => 'personal@example.com'])]);
        $personal = app(Connections::class)->addAccount($this->user->id, 'gmail', 'expired-personal-token',
            ['refresh' => 'personal-refresh', 'expires_in' => 1]);
        $this->grant($personal->id, ['gmail_search']);
        $this->admit('Read my explicitly selected personal inbox.');
        $claim = $this->claim();
        $this->route('POST', '#oauth2\.googleapis\.com/token#', Http::response(['access_token' => 'renewed-personal-token', 'expires_in' => 7200]));
        $this->route('GET', '#gmail\.googleapis\.com/gmail/v1/users/me/messages\?#', Http::response([]));
        $this->callTool($claim, 'gmail_search', $personal->id, ['query' => 'is:unread'], 'read-personal')->assertOk()
            ->assertJsonPath('action.state', 'completed');
        $fresh = Connection::query()->findOrFail($personal->id);
        $this->assertSame('renewed-personal-token', Crypt::decryptString($fresh->credential));
        $this->assertSame('personal-refresh', Crypt::decryptString($fresh->refresh_token));
        $this->assertSame('work@example.com', Connection::query()->findOrFail($work)->external_identity);
        Http::assertSent(fn ($r) => str_contains($r->url(), '/token') && $r['refresh_token'] === 'personal-refresh');
        Http::assertSent(fn ($r) => str_contains($r->url(), 'gmail.googleapis.com')
            && $r->hasHeader('Authorization', 'Bearer renewed-personal-token'));
        Http::assertNotSent(fn ($r) => $r->hasHeader('Authorization', 'Bearer work-token')
            || $r->hasHeader('Authorization', 'Bearer expired-personal-token'));
    }

    public function test_insufficient_gmail_send_scope_is_refused_without_retry_or_confirmation(): void
    {
        $conn = $this->gmailInstall('sender@example.com');
        $this->grant($conn, ['gmail_send']);
        $this->admit('Send the approved message.');
        $claim = $this->claim();
        $this->route('POST', '#gmail\.googleapis\.com/gmail/v1/users/me/messages/send#', Http::response([
            'error' => ['message' => 'Request had insufficient authentication scopes.']], 403));
        $action = $this->callTool($claim, 'gmail_send', $conn,
            ['to' => 'qa@example.com', 'subject' => 'Scope test', 'body' => 'One approved body'], 'send-scope')->assertOk()->json('action');
        $this->decide($action)->assertOk()->assertJsonPath('action.state', 'failed')
            ->assertJsonPath('action.result.reason', 'insufficient_scope');
        $this->decide($action)->assertOk()->assertJsonPath('action.state', 'failed');
        $this->assertSame(1, $this->sent('POST', '#/messages/send#'));
        $this->assertNotNull(Connection::query()->findOrFail($conn)->scope_issue);
    }
}
