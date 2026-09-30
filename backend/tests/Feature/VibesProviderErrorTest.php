<?php

namespace Tests\Feature;

use App\Jobs\RunVibesTurn;
use App\Models\User;
use App\Models\VibyraSession;
use App\Services\Vibes\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, DB, Http};
use Illuminate\Support\Str;
use Tests\Feature\Support\PinnedVibesTrial;
use Tests\TestCase;

/**
 * What the chat says when OpenRouter refuses a turn.
 *
 * Seven statuses used to settle as the single sentence "The AI provider is
 * unavailable": a wrong key, an exhausted balance, a retired model and ordinary
 * rate limiting all read identically, so nothing in the chat or the log said
 * which had happened or whose job it was to fix. These assert the four apart,
 * which is the only way the collapse cannot quietly come back.
 */
class VibesProviderErrorTest extends TestCase
{
    use PinnedVibesTrial;
    use RefreshDatabase;

    private string $token = 'vibes-error-session';
    private User $user;
    /** What the stubbed provider answers next. Read at request time, because repeated
     *  Http::fake() calls merge rather than replace and the first stub would otherwise
     *  answer every turn in a test that refuses more than once. */
    private int $status = 200;
    private array $body = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->pinTrial();
        config(['vibes.enabled' => true, 'services.openrouter.key' => 'test-only',
            'app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        $this->user = User::factory()->create(['email_verified_at' => now()]);
        VibyraSession::create(['user_id' => $this->user->id, 'token_hash' => hash('sha256', $this->token),
            'device_name' => 'iPhone']);
        $this->withToken($this->token);
        Cache::put((string) config('billing.openrouter_pricing.cache_key'), ['synced_at' => now()->toIso8601String(),
            'models' => ['qwen/qwen3.8-flash' => ['pricing' => ['prompt' => '0.00000015', 'completion' => '0.00000047'],
                'supported_parameters' => ['tools']]]]);
        Http::fake(['*' => fn () => Http::response($this->body, $this->status)]);
    }

    /** Runs one turn against a refusing provider and returns the settled row. */
    private function refused(int $status, array $body = []): object
    {
        $this->status = $status;
        $this->body = $body ?: ['error' => ['code' => $status, 'message' => 'nope',
            'metadata' => ['provider_name' => 'Stubbed']]];

        return $this->runTurn();
    }

    /** Quotes and runs one turn, returning its settled row. `$beforeJob` runs after
     *  the quote is accepted and before the job does, which is the only window in
     *  which the server's own configuration can be changed out from under a turn. */
    private function runTurn(?callable $beforeJob = null): object
    {
        $this->getJson('/api/vibes/wallet')->assertOk();
        app(Wallet::class)->grant($this->user->id, 'test-topup-'.Str::uuid(), 'topup', 500);
        $this->postJson('/api/vibes/consent', ['accepted' => true])->assertOk();
        $chat = (string) Str::uuid();
        $this->postJson('/api/vibes/chats', ['id' => $chat, 'title' => 'Build a timer'])->assertOk();
        $quote = $this->postJson('/api/vibes/quote',
            ['chatId' => $chat, 'text' => 'Build a timer', 'model' => 'qwen/qwen3.8-flash'])->assertOk()->json();
        $id = (string) Str::uuid();
        $this->postJson('/api/vibes/turns', ['id' => $id, 'quote' => $quote['quote']])->assertStatus(202);
        if ($beforeJob) $beforeJob();
        app()->call([new RunVibesTurn($id), 'handle']);

        return DB::table('vibes_turns')->where('id', $id)->first();
    }

    public function test_an_exhausted_balance_says_so_and_is_not_the_persons_fault(): void
    {
        $turn = $this->refused(402);
        $this->assertStringContainsString('run out of AI credit', $turn->error);
        $this->assertStringContainsString('Unused Vibes were returned', $turn->error);
        $this->assertSame(0, (int) $turn->charged, 'A refused turn must not be charged for.');
    }

    public function test_rate_limiting_asks_the_person_to_wait_rather_than_blaming_the_provider(): void
    {
        $this->assertStringContainsString('busy right now', $this->refused(429)->error);
    }

    public function test_a_retired_model_points_at_the_picker(): void
    {
        $this->assertStringContainsString('no longer available', $this->refused(404)->error);
    }

    public function test_a_moderated_message_tells_the_person_to_reword_it(): void
    {
        $this->assertStringContainsString('reword', $this->refused(403)->error);
    }

    public function test_a_bad_key_is_owned_by_vibyra_and_never_shown_as_the_persons_problem(): void
    {
        $error = $this->refused(401)->error;
        $this->assertStringContainsString('Vibyra cannot reach the AI', $error);
        $this->assertStringNotContainsString('Try', $error, 'There is nothing for the person to retry here.');
    }

    /**
     * The regression itself. Four refusals, four distinct sentences - the state
     * this file exists to hold, and the one a single shared string broke.
     */
    public function test_each_refusal_reads_differently_from_the_others(): void
    {
        $seen = collect([401, 402, 403, 404, 429])->map(fn ($s) => $this->refused($s)->error);
        $this->assertCount(5, $seen->unique(), 'Two refusals settled with the same sentence.');
    }

    /**
     * A server with no key is not a person who pressed stop, and saying "stopped"
     * for it is what made an unconfigured backend indistinguishable, in the chat,
     * from a cancelled request.
     */
    public function test_a_missing_key_is_not_reported_as_a_cancelled_request(): void
    {
        // Quoted while configured, because /quote refuses outright without a key;
        // what is under test is the job meeting a server that lost it afterwards.
        $this->status = 200;
        $this->body = ['id' => 'gen-x', 'usage' => ['cost' => 0.001],
            'choices' => [['message' => ['content' => 'unused']]]];
        $error = $this->runTurn(fn () => config(['services.openrouter.key' => '']))->error;
        $this->assertStringContainsString('cannot reach the AI', $error);
        $this->assertStringNotContainsString('stopped', $error);
    }
}
