<?php

namespace Tests\Feature;

use App\Services\Agents\ToolPolicy;
use App\Services\ChatConnectors\ConnectorOAuth;
use App\Services\ChatConnectors\Registry;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class GoogleConnectorsTest extends TestCase
{
    public function test_google_oauth_requests_offline_access_and_renews_with_the_required_fields(): void
    {
        config(['chat_connectors.catalogue.gmail.oauth.client_id' => 'google-id',
            'chat_connectors.catalogue.gmail.oauth.client_secret' => 'google-secret']);
        $oauth = app(ConnectorOAuth::class);
        $start = $oauth->start(42, 'gmail', null);
        parse_str((string) parse_url($start['url'], PHP_URL_QUERY), $query);
        $this->assertSame('offline', $query['access_type']);
        $this->assertContains('https://www.googleapis.com/auth/gmail.readonly', explode(' ', $query['scope']));
        $this->assertContains('https://www.googleapis.com/auth/gmail.send', explode(' ', $query['scope']));
        Http::fake(['oauth2.googleapis.com/token' => Http::response([
            'access_token' => 'renewed', 'expires_in' => 3600])]);
        $grant = $oauth->renew('gmail', 'refresh-secret');
        $this->assertSame('renewed', $grant['access']);
        Http::assertSent(fn ($request) => $request->url() === 'https://oauth2.googleapis.com/token'
            && $request['grant_type'] === 'refresh_token' && $request['refresh_token'] === 'refresh-secret'
            && $request['client_id'] === 'google-id' && $request['client_secret'] === 'google-secret');
    }

    public function test_google_oauth_callback_returns_an_offline_grant_for_the_correct_service(): void
    {
        config(['chat_connectors.enabled' => true,
            'chat_connectors.catalogue.google_calendar.oauth.client_id' => 'google-id',
            'chat_connectors.catalogue.google_calendar.oauth.client_secret' => 'google-secret']);
        $oauth = app(ConnectorOAuth::class);
        $start = $oauth->start(42, 'google_calendar', null);
        parse_str((string) parse_url($start['url'], PHP_URL_QUERY), $query);
        Http::fake(['oauth2.googleapis.com/token' => Http::response([
            'access_token' => 'calendar-access', 'refresh_token' => 'calendar-refresh', 'expires_in' => 3600])]);
        [$flow, $grant] = $oauth->finish('google_calendar', $query['state'], 'auth-code');
        $this->assertSame(42, $flow['userId']);
        $this->assertSame('calendar-refresh', $grant['refresh']);
        $this->assertSame(3600, $grant['expires_in']);
        Http::assertSent(fn ($request) => $request->url() === 'https://oauth2.googleapis.com/token'
            && $request['code'] === 'auth-code' && $request['redirect_uri'] !== ''
            && $request['grant_type'] === 'authorization_code');
        [$replay] = $oauth->finish('google_calendar', $query['state'], 'auth-code');
        $this->assertNull($replay);
    }

    public function test_google_writes_require_agent_approval_and_invalid_targets_are_rejected(): void
    {
        $policy = app(ToolPolicy::class);
        $this->assertFalse($policy->requiresApproval('gmail', 'gmail_read'));
        $this->assertTrue($policy->requiresApproval('gmail', 'gmail_send'));
        $this->assertFalse($policy->requiresApproval('google_calendar', 'google_calendar_upcoming'));
        $this->assertTrue($policy->requiresApproval('google_calendar', 'google_calendar_create_event'));
        $gmail = app(Registry::class)->for('gmail');
        try {
            $gmail->validate('gmail_send', ['to' => "a@example.com\r\nBcc: x@example.com",
                'subject' => 'Hello', 'body' => 'Hi']);
            $this->fail('A second recipient must be rejected.');
        } catch (HttpException $e) { $this->assertSame(422, $e->getStatusCode()); }
        $calendar = app(Registry::class)->for('google_calendar');
        $safe = $calendar->validate('google_calendar_create_event', ['title' => 'Call',
            'start' => '2026-10-01T09:00:00Z', 'end' => '2026-10-01T10:00:00Z']);
        $this->assertSame('Call', $safe['title']);
        try {
            $calendar->validate('google_calendar_create_event', ['title' => 'Too long',
                'start' => '2026-10-01T09:00:00Z', 'end' => '2026-10-03T10:00:00Z']);
            $this->fail('An overlong event must be rejected.');
        } catch (HttpException $e) { $this->assertSame(422, $e->getStatusCode()); }
    }

    public function test_gmail_send_places_only_approved_text_in_a_single_recipient_message(): void
    {
        Http::fake(['gmail.googleapis.com/*' => Http::response(['id' => 'sent-1'])]);
        $connector = app(Registry::class)->for('gmail');
        $connector->run('gmail_send', $connector->validate('gmail_send', [
            'to' => 'a@example.com', 'subject' => 'Project update', 'body' => "Hello\nDone." ]), 'test-token');
        Http::assertSent(function ($request) {
            if ($request->method() !== 'POST' || $request->url() !== 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send') return false;
            $mime = base64_decode(strtr($request['raw'], '-_', '+/'), true);
            return is_string($mime) && str_contains($mime, "To: a@example.com\r\n")
                && str_contains($mime, "Subject: Project update\r\n")
                && str_contains($mime, base64_encode("Hello\nDone."))
                && !str_contains($mime, 'Bcc:');
        });
    }

    public function test_drive_exports_only_supported_text_and_rejects_binary_content(): void
    {
        $drive = app(Registry::class)->for('google_drive');
        Http::fake(['www.googleapis.com/drive/v3/files/*' => function ($request) {
            if (str_ends_with($request->url(), '/export?mimeType=text%2Fplain'))
                return Http::response('Approved meeting notes');
            return Http::response(['id' => 'abcdefghijkl', 'name' => 'Notes',
                'mimeType' => 'application/vnd.google-apps.document']);
        }]);
        $outcome = $drive->run('google_drive_read', ['id' => 'abcdefghijkl'], 'test-token');
        $this->assertSame('Approved meeting notes', $outcome['result']['text']);
        $this->assertFalse($outcome['result']['truncated']);
        Http::assertSent(fn ($request) => str_contains($request->url(), '/export?mimeType=text%2Fplain'));

    }

    public function test_drive_refuses_binary_file_content(): void
    {
        Http::fake(['www.googleapis.com/drive/v3/files/*' => Http::response([
            'id' => 'abcdefghijkl', 'name' => 'Photo', 'mimeType' => 'image/jpeg', 'size' => 800])]);
        $this->expectException(\RuntimeException::class);
        app(Registry::class)->for('google_drive')->run('google_drive_read', ['id' => 'abcdefghijkl'], 'test-token');
    }
}
