<?php

namespace Tests\Feature;

use App\Services\Agents\ToolPolicy;
use App\Services\ChatConnectors\ConnectorOAuth;
use App\Services\ChatConnectors\Registry;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class AdditionalConnectorsTest extends TestCase
{
    public function test_microsoft_oauth_uses_delegated_scopes_and_refreshes(): void
    {
        config(['chat_connectors.catalogue.outlook_mail.oauth.client_id' => 'ms-id',
            'chat_connectors.catalogue.outlook_mail.oauth.client_secret' => 'ms-secret']);
        $oauth = app(ConnectorOAuth::class);
        $start = $oauth->start(42, 'outlook_mail', null);
        parse_str((string) parse_url($start['url'], PHP_URL_QUERY), $query);
        $this->assertContains('Mail.Read', explode(' ', $query['scope']));
        $this->assertContains('Mail.Send', explode(' ', $query['scope']));
        $this->assertContains('offline_access', explode(' ', $query['scope']));
        $this->assertSame('S256', $query['code_challenge_method']);
        Http::fake(['login.microsoftonline.com/*' => Http::response([
            'access_token' => 'renewed', 'refresh_token' => 'next', 'expires_in' => 3600])]);
        $grant = $oauth->renew('outlook_mail', 'old');
        $this->assertSame('next', $grant['refresh']);
        Http::assertSent(fn ($request) => $request['grant_type'] === 'refresh_token'
            && $request['client_id'] === 'ms-id' && $request['client_secret'] === 'ms-secret');
    }

    public function test_notion_oauth_uses_json_basic_auth_and_owner_user(): void
    {
        config(['chat_connectors.enabled' => true,
            'chat_connectors.catalogue.notion.oauth.client_id' => 'notion-id',
            'chat_connectors.catalogue.notion.oauth.client_secret' => 'notion-secret']);
        $oauth = app(ConnectorOAuth::class);
        $start = $oauth->start(42, 'notion', null);
        parse_str((string) parse_url($start['url'], PHP_URL_QUERY), $query);
        $this->assertSame('user', $query['owner']);
        $this->assertArrayNotHasKey('scope', $query);
        Http::fake(['api.notion.com/v1/oauth/token' => Http::response([
            'access_token' => 'notion-access', 'refresh_token' => 'notion-refresh'])]);
        [$flow, $grant] = $oauth->finish('notion', $query['state'], 'code');
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

    public function test_slack_and_microsoft_writes_are_approval_gated(): void
    {
        $policy = app(ToolPolicy::class);
        foreach (['slack' => ['slack_history', 'slack_post_message'],
            'outlook_mail' => ['outlook_mail_read', 'outlook_mail_send'],
            'outlook_calendar' => ['outlook_calendar_upcoming', 'outlook_calendar_create_event']] as $slug => [$read, $write]) {
            $this->assertFalse($policy->requiresApproval($slug, $read));
            $this->assertTrue($policy->requiresApproval($slug, $write));
        }
    }

    public function test_onedrive_download_uses_only_a_trusted_host_and_no_bearer(): void
    {
        Http::fake([
            'graph.microsoft.com/v1.0/me/drive/items/*' => Http::response([
                'id' => 'item123', 'name' => 'Notes.txt', 'size' => 5,
                'file' => ['mimeType' => 'text/plain'],
                '@microsoft.graph.downloadUrl' => 'https://files.example.sharepoint.com/notes']),
            'files.example.sharepoint.com/*' => Http::response('hello'),
        ]);
        $connector = app(Registry::class)->for('onedrive');
        $outcome = $connector->run('onedrive_read', ['id' => 'item123'], 'secret-access-token');
        $this->assertSame('hello', $outcome['result']['text']);
        Http::assertSent(fn ($request) => str_contains($request->url(), 'sharepoint.com/notes')
            && !$request->hasHeader('Authorization'));
    }

    public function test_onedrive_rejects_an_untrusted_download_host(): void
    {
        Http::fake(['graph.microsoft.com/*' => Http::response([
            'id' => 'item123', 'name' => 'Notes.txt', 'size' => 5,
            'file' => ['mimeType' => 'text/plain'],
            '@microsoft.graph.downloadUrl' => 'https://127.0.0.1/private'])]);
        $this->expectException(HttpException::class);
        app(Registry::class)->for('onedrive')->run('onedrive_read', ['id' => 'item123'], 'test-token');
    }
}
