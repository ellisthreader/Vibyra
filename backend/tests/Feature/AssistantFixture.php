<?php
namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use App\Services\Membership\Enrollment;
use App\Services\Vibes\Wallet;
use Illuminate\Support\Facades\{DB, Http};
use Illuminate\Support\Str;

trait AssistantFixture
{
    private User $user;
    protected function setUp(): void
    {
        parent::setUp();
        config(['app.key' => 'base64:'.base64_encode(str_repeat('a', 32)), 'assistant.enabled' => true,
            'services.openai.key' => 'server-test-secret', 'membership.free_enabled' => false,
            'membership.enabled' => false, 'vibes.daily_micro_usd_limit' => 100_000_000]);
        $this->user = User::factory()->create(['email_verified_at' => now(), 'credits_balance' => 0]);
        app(Wallet::class)->ensure($this->user, 0);
        app(Enrollment::class)->migrate($this->user, 0);
        app(Wallet::class)->grant($this->user->id, 'assistant-test-funds', 'topup', 1_000_000);
        VibyraSession::create(['user_id' => $this->user->id, 'token_hash' => hash('sha256', 'assistant-session'), 'last_used_at' => now()]);
        $this->withToken('assistant-session');
        Http::preventStrayRequests();
    }
    private function chat(array $extra = []): array
    {
        return [...['requestId' => (string) Str::uuid(), 'messages' => [['role' => 'user', 'content' => 'Hello']]], ...$extra];
    }
    private function stream(?array $usage = null, bool $done = true): string
    {
        $frame = ['choices' => [['delta' => ['content' => 'Hello from Vibyra']]]];
        $s = 'data: '.json_encode($frame)."\n\n";
        if ($usage !== null) $s .= 'data: '.json_encode(['choices' => [], 'usage' => $usage])."\n\n";
        return $s.($done ? "data: [DONE]\n\n" : '');
    }
    private function funds(): int { return app(Wallet::class)->available($this->user->id); }
    private function wav(float $seconds = 1): string
    {
        $pcm = str_repeat("\0", (int) ($seconds * 16000 * 2));
        return 'RIFF'.pack('V', 36 + strlen($pcm)).'WAVEfmt '.pack('VvvVVvv', 16, 1, 1, 16000, 32000, 2, 16)
            .'data'.pack('V', strlen($pcm)).$pcm;
    }
}
