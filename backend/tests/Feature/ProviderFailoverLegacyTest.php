<?php

namespace Tests\Feature;

use App\Models\{CreditLedger, User};
use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use GuzzleHttp\Psr7\Response as GuzzleResponse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, Http};
use Tests\TestCase;

/** Same-tier failover for the legacy /api/chat and /api/chat/stream (PROVIDER_FAILOVER_ENABLED). */
class ProviderFailoverLegacyTest extends TestCase
{
    use RefreshDatabase;

    private string $token;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.openrouter.key' => 'test-openrouter-key', 'model_resilience.failover.enabled' => true]);
        $this->token = $this->postJson('/api/auth/signup', ['name' => 'Failover', 'email' => 'failover@example.com', 'password' => 'secret123'])->json('token');
        User::where('email', 'failover@example.com')->update(['plan' => 'starter', 'credits_balance' => 500]);
    }

    private function chat(string $model = 'gpt-5.4-mini', array $extra = [])
    {
        return $this->postJson('/api/chat', ['prompt' => 'Explain closures briefly.', 'mode' => 'chat', 'model' => $model] + $extra, ['Authorization' => "Bearer {$this->token}"]);
    }

    private function good(float $cost = 0.0002): array
    {
        return ['choices' => [['message' => ['content' => 'A closure captures its scope.']]], 'usage' => ['prompt_tokens' => 30, 'completion_tokens' => 12, 'cost' => $cost]];
    }

    public function test_a_provider_error_retries_once_on_a_same_tier_model_and_charges_once(): void
    {
        Http::fakeSequence()->push(['error' => ['message' => 'Provider returned error']], 503)->push($this->good());
        $response = $this->chat()->assertOk();

        $sent = Http::recorded()->map(fn ($r) => $r[0]->data()['model'])->all();
        $this->assertCount(2, $sent);
        $this->assertSame('openai/gpt-5.4-mini', $sent[0]);
        $this->assertNotSame($sent[0], $sent[1]);
        $this->assertSame('budget', collect(config('billing.models'))->firstWhere('slug', $sent[1])['tier'], 'the same tier as the model the person picked');
        $response->assertJsonPath('model', $sent[1]);
        $this->assertSame(1, CreditLedger::where('kind', 'chat')->count(), 'one settlement for one reply');
        $this->assertSame(0, (int) User::where('email', 'failover@example.com')->value('openrouter_reserved_micro_usd'));
    }

    public function test_both_attempts_failing_returns_busy_and_releases_the_hold(): void
    {
        Http::fakeSequence()->push(['error' => ['message' => 'x']], 503)->push(['error' => ['message' => 'y']], 502);
        $before = (int) User::where('email', 'failover@example.com')->value('credits_balance');
        $this->chat()->assertStatus(503)->assertJsonPath('code', 'service_busy')->assertHeader('Retry-After');

        $this->assertSame($before, (int) User::where('email', 'failover@example.com')->value('credits_balance'), 'nothing was spent');
        $this->assertSame(0, CreditLedger::where('kind', 'chat')->count());
        $this->assertSame(0, (int) User::where('email', 'failover@example.com')->value('openrouter_reserved_micro_usd'));
    }

    public function test_a_tier_the_plan_does_not_allow_is_never_used_as_an_alternate(): void
    {
        User::where('email', 'failover@example.com')->update(['plan' => 'free']);
        config(['model_resilience.failover.legacy_alternates.budget' => ['claude-opus-5']]); // premium: not on Free
        Http::fakeSequence()->push(['error' => ['message' => 'x']], 503);
        $this->chat()->assertStatus(503)->assertJsonPath('code', 'service_busy');
        $this->assertCount(1, Http::recorded(), 'no retry on a model of another tier');
    }

    public function test_a_skill_that_pins_its_model_is_never_moved(): void
    {
        Http::fakeSequence()->push(['error' => ['message' => 'x']], 503);
        $this->chat('auto', ['skill' => 'web'])->assertStatus(503);
        $this->assertCount(1, Http::recorded());
    }

    public function test_with_the_flag_off_a_provider_error_is_returned_as_before(): void
    {
        config(['model_resilience.failover.enabled' => false]);
        Http::fakeSequence()->push(['error' => ['message' => 'Provider returned error']], 503);
        $this->chat()->assertStatus(503)->assertJsonPath('error', 'Provider returned error');
        $this->assertCount(1, Http::recorded());
    }

    public function test_the_stream_retries_before_the_first_byte_and_reports_the_answering_model(): void
    {
        $history = [];
        $stream = 'data: '.json_encode(['choices' => [['delta' => ['content' => 'Hello']]], 'usage' => ['prompt_tokens' => 20, 'completion_tokens' => 8, 'cost' => 0.001]])."\n\ndata: [DONE]\n\n";
        $mock = new MockHandler([new GuzzleResponse(503, ['Content-Type' => 'application/json'], json_encode(['error' => ['message' => 'down']])),
            new GuzzleResponse(200, ['Content-Type' => 'text/event-stream'], $stream)]);
        $stack = HandlerStack::create($mock);
        $stack->push(Middleware::history($history));
        app()->instance('vibyra.openrouter_stream_client', new GuzzleClient(['handler' => $stack, 'http_errors' => false]));

        $content = $this->post('/api/chat/stream', ['prompt' => 'Say hello.', 'model' => 'gpt-5.4-mini'], ['Authorization' => "Bearer {$this->token}"])->streamedContent();

        $this->assertCount(2, $history);
        $served = json_decode((string) $history[1]['request']->getBody(), true)['model'];
        $this->assertNotSame('openai/gpt-5.4-mini', $served);
        $this->assertStringContainsString('"model":"'.$served.'"', $content);
        $this->assertStringContainsString('Hello', $content);
        $this->assertSame(1, CreditLedger::where('kind', 'chat')->count());
    }

    public function test_the_stream_says_busy_when_nothing_is_reachable(): void
    {
        $mock = new MockHandler([new GuzzleResponse(503, [], '{"error":{"message":"down"}}'), new GuzzleResponse(502, [], '{"error":{"message":"down"}}')]);
        app()->instance('vibyra.openrouter_stream_client', new GuzzleClient(['handler' => HandlerStack::create($mock), 'http_errors' => false]));
        $content = $this->post('/api/chat/stream', ['prompt' => 'Say hello.', 'model' => 'gpt-5.4-mini'], ['Authorization' => "Bearer {$this->token}"])->streamedContent();
        $this->assertStringContainsString('service_busy', $content);
        $this->assertSame(0, CreditLedger::where('kind', 'chat')->count());
    }
}
