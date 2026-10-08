<?php

namespace Tests\Feature;

use App\Services\ChatConnectors\{ReconnectRequired, Registry};
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

/**
 * What a provider's refusal is worded as. Only a sign-in the provider no longer honours says "reconnect"; a missing
 * scope, an unshared page, a bot outside the channel or an admin who has not approved the app say that instead of
 * reading as an outage or an empty result. Also the Microsoft request shapes that used to fail outright.
 */
class ConnectorHonestErrorsTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['chat_connectors.enabled' => true]);
    }

    /** The message the model would be told when this call is refused. */
    private function refused(string $slug, string $operation, array $arguments, mixed $answer, int $status = 200): string
    {
        Http::swap(new \Illuminate\Http\Client\Factory); // a fresh fake each time: the first matching stub would otherwise keep answering
        Http::fake(['*' => Http::response($answer, $status)]);
        try { app(Registry::class)->for($slug)->run($operation, $arguments, 'fixture-token'); }
        catch (HttpException $e) { return $e->getMessage(); }
        $this->fail('Expected a plain refusal.');
    }

    public function test_slack_names_a_missing_scope_and_a_bot_outside_the_channel(): void
    {
        $history = ['channel' => 'C0123456789'];
        $this->assertStringContainsString('(channels:history)', $this->refused('slack', 'slack_history', $history, ['ok' => false, 'error' => 'missing_scope', 'needed' => 'channels:history']));
        $this->assertStringContainsString('not a member of that channel', $this->refused('slack', 'slack_history', $history, ['ok' => false, 'error' => 'not_in_channel']));
        $this->assertStringContainsString('rate-limiting', $this->refused('slack', 'slack_channels', [], ['ok' => false, 'error' => 'ratelimited'], 429));
    }

    public function test_slack_still_asks_for_a_new_sign_in_when_the_token_is_dead(): void
    {
        Http::fake(['*' => Http::response(['ok' => false, 'error' => 'token_expired'])]);
        $this->expectException(ReconnectRequired::class);
        app(Registry::class)->for('slack')->run('slack_channels', [], 'fixture-token');
    }

    public function test_notion_says_an_unshared_page_needs_sharing_and_search_asks_for_pages_only(): void
    {
        $message = $this->refused('notion', 'notion_read_page', ['id' => str_repeat('a', 32)], ['object' => 'error', 'code' => 'object_not_found'], 404);
        $this->assertStringContainsString('shared with the Vibyra connection', $message);
        Http::swap(new \Illuminate\Http\Client\Factory);
        Http::fake(['api.notion.com/*' => Http::response(['results' => [], 'has_more' => false])]);
        app(Registry::class)->for('notion')->run('notion_search', ['query' => 'plan'], 'fixture-token');
        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/v1/search') && $r['filter'] === ['property' => 'object', 'value' => 'page']
            && $r->hasHeader('Notion-Version', '2026-03-11'));
    }

    public function test_linear_words_its_own_errors_for_the_person(): void
    {
        $issue = ['id' => 'ENG-12'];
        $said = ['data' => null, 'errors' => [['message' => 'Entity not found', 'extensions' => ['code' => 'INVALID_INPUT', 'userPresentableMessage' => 'Could not find referenced Issue.']]]];
        $this->assertSame('Linear: Could not find referenced Issue.', $this->refused('linear', 'linear_issue', $issue, $said, 400));
        $this->assertStringContainsString('fewer permissions', $this->refused('linear', 'linear_teams', [], ['data' => null, 'errors' => [['extensions' => ['code' => 'FORBIDDEN']]]]));
        $this->assertStringContainsString('rate-limiting', $this->refused('linear', 'linear_teams', [], ['errors' => [['extensions' => ['code' => 'RATELIMITED']]]], 400));
        $this->assertStringContainsString('did not find that issue', $this->refused('linear', 'linear_issue', $issue, ['data' => ['issue' => null]]));
    }

    public function test_microsoft_says_denied_missing_and_busy_instead_of_unreachable(): void
    {
        $search = ['query' => 'plan'];
        $this->assertStringContainsString('admin has not approved', $this->refused('onedrive', 'onedrive_search', $search, ['error' => ['code' => 'accessDenied']], 403));
        $this->assertStringContainsString('(accessDenied)', $this->refused('onedrive', 'onedrive_search', $search, ['error' => ['code' => 'accessDenied']], 403));
        $this->assertStringContainsString('could not find that item', $this->refused('onedrive', 'onedrive_read', ['id' => 'ABC123'], ['error' => ['code' => 'itemNotFound']], 404));
        $this->assertStringContainsString('rate-limiting', $this->refused('sharepoint', 'sharepoint_sites', $search, [], 429));
    }

    public function test_google_names_a_disabled_api_and_a_missing_scope(): void
    {
        $disabled = ['error' => ['code' => 403, 'status' => 'PERMISSION_DENIED', 'details' => [['reason' => 'SERVICE_DISABLED']]]];
        $scope = ['error' => ['code' => 403, 'errors' => [['reason' => 'insufficientPermissions']], 'details' => [['reason' => 'ACCESS_TOKEN_SCOPE_INSUFFICIENT']]]];
        $this->assertStringContainsString('not switched on for Vibyra', $this->refused('gmail', 'gmail_search', ['query' => 'a'], $disabled, 403));
        $this->assertStringContainsString('Reconnect Google', $this->refused('gmail', 'gmail_search', ['query' => 'a'], $scope, 403));
    }

    public function test_the_microsoft_requests_graph_used_to_reject(): void
    {
        Http::fake(['graph.microsoft.com/*' => Http::response(['value' => []])]);
        $registry = app(Registry::class);
        $registry->for('outlook_mail')->run('outlook_mail_search', ['query' => 'say "hi" now'], 't');
        $registry->for('teams')->run('teams_chats', [], 't');
        Http::assertSent(fn ($r) => str_contains($r->url(), '/me/messages') && substr_count((string) $r['$search'], '"') === 2);
        Http::assertSent(fn ($r) => str_contains($r->url(), '/me/chats') && $r['$orderby'] === 'lastMessagePreview/createdDateTime desc');
    }

    public function test_a_personal_onedrive_download_link_is_trusted(): void
    {
        $link = 'https://my.microsoftpersonalcontent.com/personal/abc/_layouts/15/download.aspx?UniqueId=1&tempauth=x';
        Http::fake(['graph.microsoft.com/*' => Http::response(['id' => 'i1', 'name' => 'n.txt', 'size' => 2, 'file' => ['mimeType' => 'text/plain'], '@microsoft.graph.downloadUrl' => $link]),
            'my.microsoftpersonalcontent.com/*' => Http::response('hi')]);
        $out = app(Registry::class)->for('onedrive')->run('onedrive_read', ['id' => 'i1'], 't');
        $this->assertSame('hi', $out['result']['text']);
        Http::assertSent(fn ($r) => str_contains($r->url(), 'microsoftpersonalcontent.com') && !$r->hasHeader('Authorization'));
    }
}
