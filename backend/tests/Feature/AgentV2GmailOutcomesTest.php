<?php

namespace Tests\Feature;

use App\Models\AgentV2\Connection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Crypt, Http};
use Tests\Support\{AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/** Gmail Stage 2 completion: pagination, truncation, exact send with receipt, typed outcomes (fixtures). */
class AgentV2GmailOutcomesTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes;

    private const GMAIL = '#gmail\.googleapis\.com/gmail/v1/users/me/messages';
    private const SEND = ['to' => 'qa-recipient@example.com', 'subject' => 'Weekly summary', 'body' => 'Two seeded emails.'];
    private string $conn;
    private array $claimed;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
        $this->conn = $this->providerInstall('gmail', 'owner@example.com', 'gmail-token');
    }

    private function start(array $ops): array
    {
        $this->grant($this->conn, $ops);
        $run = $this->admit('Summarize and email.');
        $this->claimed = $this->claim();
        return $run;
    }

    private function mail(string $tool, array $args, string $callId)
    {
        return $this->callTool($this->claimed, $tool, $this->conn, $args, $callId)->assertOk();
    }

    public function test_search_is_paginated_and_reads_say_when_they_were_cut(): void
    {
        $this->start(['gmail_read', 'gmail_search']);
        $this->route('GET', self::GMAIL.'\?#', fn ($r) => Http::response(isset($r['pageToken'])
            ? ['messages' => [['id' => 'msg00002']], 'resultSizeEstimate' => 2]
            : ['messages' => [['id' => 'msg00001']], 'nextPageToken' => 'tok-2', 'resultSizeEstimate' => 2]));
        $long = str_repeat('a', 12000).'TAIL';
        $this->route('GET', self::GMAIL.'/msg0000\d#', fn ($r) => Http::response(['id' => basename(parse_url($r->url(), PHP_URL_PATH)),
            'payload' => ['mimeType' => 'text/plain', 'headers' => [['name' => 'Subject', 'value' => 'Long']],
                'body' => ['data' => rtrim(strtr(base64_encode($long), '+/', '-_'), '=')]]]));
        $this->mail('gmail_search', ['query' => 'label:qa', 'maxResults' => 1], 's1')
            ->assertJsonPath('action.result.hasMore', true)->assertJsonPath('action.result.nextPageToken', 'tok-2')
            ->assertJsonPath('action.result.messages.0.id', 'msg00001');
        $this->mail('gmail_search', ['query' => 'label:qa', 'pageToken' => 'tok-2'], 's2')
            ->assertJsonPath('action.result.hasMore', false)->assertJsonPath('action.result.messages.0.id', 'msg00002');
        $this->mail('gmail_read', ['id' => 'msg00001'], 'r1')->assertJsonPath('action.result.truncated', true)
            ->assertJsonPath('action.result.bodyChars', 12004)->assertJsonPath('action.result.nextStartChar', 12000);
        $this->mail('gmail_read', ['id' => 'msg00001', 'startChar' => 12000], 'r2')->assertJsonPath('action.result.body', 'TAIL')
            ->assertJsonPath('action.result.truncated', false);
        $this->mail('gmail_search', ['query' => 'x', 'maxResults' => 50], 's3')->assertJsonPath('action.result.reason', 'invalid_arguments');
    }

    public function test_send_posts_exactly_what_was_approved_and_confirms_the_provider_id(): void
    {
        $this->start(['gmail_send']);
        $this->route('POST', self::GMAIL.'/send#', Http::response(['id' => 'sent-42', 'threadId' => 'thr-42', 'labelIds' => ['SENT']]));
        $action = $this->mail('gmail_send', self::SEND, 'w1')->assertJsonPath('action.state', 'pending_approval')->json('action');
        $this->assertSame(0, $this->sent('POST', self::GMAIL.'/send#'));
        $this->postJson('/api/agents/v2/actions/'.$action['id'].'/decision', ['fingerprint' => str_repeat('a', 64),
            'decision' => 'allow'])->assertStatus(409)->assertJsonPath('code', 'stale_fingerprint');
        $this->decide($action)->assertOk()->assertJsonPath('action.receipt.providerResourceId', 'sent-42')
            ->assertJsonPath('action.receipt.outcome', 'confirmed');
        $this->decide($action)->assertOk();
        $this->assertSame(1, $this->sent('POST', self::GMAIL.'/send#'));
        Http::assertSent(function ($r) use ($action) {
            if (!str_ends_with($r->url(), '/send')) return false;
            $mime = base64_decode(strtr($r['raw'], '-_', '+/'));
            return str_contains($mime, "To: qa-recipient@example.com\r\n") && str_contains($mime, 'Message-ID: <vibyra-'.$action['id'])
                && str_contains($mime, base64_encode(self::SEND['body'])) && !str_contains(strtolower($mime), "\r\ncc:");
        });
    }

    public function test_a_timed_out_send_is_reconciled_by_message_id_or_left_unknown(): void
    {
        $run = $this->start(['gmail_send']);
        $this->route('POST', self::GMAIL.'/send#', $this->timeout());
        $this->route('GET', self::GMAIL.'\?#', Http::response([]));
        $lost = $this->mail('gmail_send', self::SEND, 'w1')->json('action');
        $this->decide($lost)->assertOk()->assertJsonPath('action.state', 'unknown')->assertJsonPath('action.receipt.status', 'unknown');
        Http::assertSent(fn ($r) => str_contains((string) ($r->data()['q'] ?? ''), 'in:sent rfc822msgid:<vibyra-'.$lost['id']));
        $this->mail('gmail_send', self::SEND, 'w2')->assertJsonPath('action.result.reason', 'outcome_unknown');
        $this->route('GET', self::GMAIL.'\?#', Http::response(['messages' => [['id' => 'sent-late', 'threadId' => 't']]]));
        $found = $this->mail('gmail_send', array_replace(self::SEND, ['subject' => 'Other']), 'w3')->json('action');
        $this->decide($found)->assertOk()->assertJsonPath('action.state', 'completed')
            ->assertJsonPath('action.result.reconciled', true)->assertJsonPath('action.receipt.providerResourceId', 'sent-late');
        $this->assertSame(2, $this->sent('POST', self::GMAIL.'/send#'), 'Nothing is ever re-sent.');
        $this->assertSame('running', $this->runState($run['id']));
    }

    public function test_rate_limits_and_server_errors_are_typed_and_invalid_grant_waits_for_sign_in(): void
    {
        $this->start(['gmail_search']);
        $this->route('GET', self::GMAIL.'\?#', Http::response(['error' => ['code' => 429]], 429, ['Retry-After' => '12']));
        $this->mail('gmail_search', ['query' => 'x'], 'a')->assertJsonPath('action.result.outcome', 'rate_limited')
            ->assertJsonPath('action.result.retryAfter', 12);
        $this->route('GET', self::GMAIL.'\?#', Http::response(['error' => ['errors' => [['reason' => 'userRateLimitExceeded']]]], 403));
        $this->mail('gmail_search', ['query' => 'x'], 'b')->assertJsonPath('action.result.outcome', 'rate_limited');
        $this->route('GET', self::GMAIL.'\?#', Http::response('oops', 500));
        $this->mail('gmail_search', ['query' => 'x'], 'c')->assertJsonPath('action.result.outcome', 'retryable');
        // An extra account whose refresh token Google refuses: reconnect required, the run waits for sign-in.
        Http::fake(['www.googleapis.com/oauth2/v3/userinfo' => Http::response(['email' => 'second@example.com'])]);
        config(['chat_connectors.catalogue.gmail.oauth.client_id' => 'id', 'chat_connectors.catalogue.gmail.oauth.client_secret' => 's']);
        $second = app(\App\Services\AgentRuns\Connections\Connections::class)->addAccount($this->user->id, 'gmail', 'second-token',
            ['refresh' => 'dead-refresh', 'expires_in' => 10]);
        $this->route('POST', '#oauth2\.googleapis\.com/token#', Http::response(['error' => 'invalid_grant'], 400));
        $this->grant($second->id, ['gmail_search']);
        $run = $this->admit('Second inbox.');
        $this->postJson('/api/agents/v2/runs/'.$this->claimed['id'].'/cancel')->assertOk();
        $this->travel(config('agents_v2.lease_seconds') + 5)->seconds();
        $this->claimed = $this->claim();
        $this->callTool($this->claimed, 'gmail_search', $second->id, ['query' => 'x'], 'd')->assertOk()
            ->assertJsonPath('action.result.outcome', 'reconnect_required');
        $this->assertSame('waiting_for_signin', $this->runState($run['id']));
        $this->assertSame('reconnect_required', Connection::query()->find($second->id)->health);
        $this->assertSame('second-token', Crypt::decryptString(Connection::query()->find($second->id)->credential));
    }
}
