<?php
namespace Tests\Feature;

use App\Models\VibyraSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\TestCase;

class AssistantGatewayTest extends TestCase
{
    use RefreshDatabase, AssistantFixture;

    public function test_requires_verified_non_guest_current_bearer_session(): void
    {
        $this->withToken('bad')->getJson('/api/assistant/status')->assertUnauthorized();
        $this->withToken('assistant-session');
        $this->user->forceFill(['email_verified_at' => null])->save();
        $this->getJson('/api/assistant/status')->assertForbidden();
        $this->user->forceFill(['email_verified_at' => now(), 'guest_at' => now()])->save();
        $this->getJson('/api/assistant/status')->assertForbidden();
        $this->user->forceFill(['guest_at' => null])->save();
        $this->withHeader('X-Vibyra-Runner-Key', 'runner')->getJson('/api/assistant/status')->assertForbidden();
        $this->flushHeaders()->withToken('assistant-session');
        VibyraSession::query()->delete();
        $this->getJson('/api/assistant/status')->assertUnauthorized();
        Http::assertNothingSent();
    }
    public function test_cookie_only_and_missing_configuration_never_call_provider(): void
    {
        $this->flushHeaders()->actingAs($this->user)->getJson('/api/assistant/status')->assertUnauthorized();
        $this->withToken('assistant-session'); config(['services.openai.key' => '']);
        $this->getJson('/api/assistant/status')->assertOk()->assertJsonPath('available', false)->assertDontSee('server-test-secret');
        $this->postJson('/api/assistant/chat', $this->chat())->assertStatus(503);
        Http::assertNothingSent();
    }
    public function test_status_is_private_and_reports_token_funding_without_key_material(): void
    {
        $this->getJson('/api/assistant/status')->assertOk()->assertJsonPath('available', true)
            ->assertJsonPath('funding', 'vibyra_tokens')->assertJsonPath('unitScale', 10000)
            ->assertJsonPath('availableUnits', '1000000')->assertDontSee('server-test-secret');
    }
    public function test_stream_uses_fixed_provider_and_fractional_wallet_settlement_once(): void
    {
        Http::fake(['api.openai.com/*' => Http::response($this->stream(['prompt_tokens' => 100, 'completion_tokens' => 20,
            'prompt_tokens_details' => ['cached_tokens' => 80]]))]);
        $body = $this->chat(['model' => 'expensive-model', 'apiKey' => 'attacker-key', 'url' => 'https://attacker.test']);
        $r = $this->postJson('/api/assistant/chat', $body)->assertOk();
        $this->assertStringContainsString('[DONE]', $r->streamedContent());
        $this->assertSame(999953, $this->funds()); // 20 uncached + 80 cached + 20 completion = 47 micro-USD.
        $this->postJson('/api/assistant/chat', $body)->assertConflict();
        Http::assertSentCount(1);
        Http::assertSent(fn ($r) => $r->url() === 'https://api.openai.com/v1/chat/completions'
            && $r->hasHeader('Authorization', 'Bearer server-test-secret') && $r['model'] === 'gpt-5-mini'
            && $r['max_completion_tokens'] === 1600 && $r['store'] === false && !isset($r['apiKey']) && !isset($r['url']));
        $this->assertSame(1, DB::table('vibes_ledger')->where('kind', 'assistant_settlement')->count());
    }
    public function test_validation_refuses_cost_amplification_before_any_reservation(): void
    {
        $this->postJson('/api/assistant/chat', $this->chat(['messages' => array_fill(0, 26, ['role' => 'user', 'content' => 'x'])]))->assertUnprocessable();
        $this->postJson('/api/assistant/chat', $this->chat(['messages' => [['role' => 'tool', 'content' => 'x']]]))->assertUnprocessable();
        $this->postJson('/api/assistant/chat', $this->chat(['tools' => [['type' => 'web_search']]]))->assertUnprocessable();
        $this->assertSame(0, DB::table('assistant_requests')->count()); Http::assertNothingSent();
    }
    public function test_insufficient_tokens_is_402_and_never_contacts_provider(): void
    {
        DB::table('vibes_grants')->update(['remaining' => 0]);
        $this->postJson('/api/assistant/chat', $this->chat())->assertStatus(402)->assertJsonPath('code', 'assistant_tokens');
        $this->assertSame(0, DB::table('assistant_requests')->count()); Http::assertNothingSent();
    }
    public function test_provider_errors_are_redacted_and_customer_gets_unused_tokens_back(): void
    {
        Http::fake(['api.openai.com/*' => Http::response(['error' => ['message' => 'server-test-secret']], 401)]);
        $this->postJson('/api/assistant/chat', $this->chat())->assertStatus(502)->assertDontSee('server-test-secret');
        $this->assertSame(1_000_000, $this->funds());
        $row = DB::table('assistant_requests')->first();
        $this->assertSame('uncertain', $row->state); $this->assertSame(0, $row->charged_units);
        $this->assertGreaterThan(0, $row->charged_micro_usd);
    }
    public function test_truncated_and_error_streams_keep_operator_reserve_and_refund_unknown_usage(): void
    {
        Http::fake(['api.openai.com/*' => Http::response($this->stream(null, false))]);
        $r = $this->postJson('/api/assistant/chat', $this->chat())->assertOk();
        $this->assertStringContainsString('interrupted', $r->streamedContent());
        $this->assertSame(1_000_000, $this->funds());
        $this->assertDatabaseHas('assistant_requests', ['state' => 'uncertain', 'charged_units' => 0]);
    }
    public function test_transcription_validates_wav_and_keeps_language_and_key_server_side(): void
    {
        Http::fake(['api.openai.com/*' => Http::response(['text' => 'A real sentence'])]);
        $body = ['requestId' => $this->chat()['requestId'], 'audio' => base64_encode($this->wav()), 'language' => 'fr'];
        $this->postJson('/api/assistant/transcriptions', $body)->assertOk()->assertJsonPath('text', 'A real sentence');
        $this->assertSame(999900, $this->funds());
        $this->postJson('/api/assistant/transcriptions', [...$body, 'audio' => base64_encode('not-wav')])->assertUnprocessable();
        Http::assertSentCount(1);
        Http::assertSent(fn ($r) => $r->hasHeader('Authorization', 'Bearer server-test-secret')
            && str_contains($r->body(), 'whisper-1') && str_contains($r->body(), 'name="language"'));
    }
    public function test_speech_reads_usage_and_returns_only_audio(): void
    {
        $events = 'data: '.json_encode(['type' => 'speech.audio.delta', 'audio' => base64_encode('fixture-mp3')])."\n\n"
            .'data: '.json_encode(['type' => 'speech.audio.done', 'usage' => ['input_tokens' => 6, 'output_tokens' => 66]])."\n\n";
        Http::fake(['api.openai.com/*' => Http::response($events)]);
        $body = ['requestId' => $this->chat()['requestId'], 'text' => 'Vibyra is ready.', 'voice' => 'alloy', 'speed' => 1, 'format' => 'mp3'];
        $this->postJson('/api/assistant/speech', $body)->assertOk()->assertHeader('Content-Type', 'audio/mpeg')->assertContent('fixture-mp3');
        $this->assertSame(999204, $this->funds());
        $this->postJson('/api/assistant/speech', [...$body, 'voice' => 'expensive-model'])->assertUnprocessable();
        Http::assertSentCount(1);
    }
}
