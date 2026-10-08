<?php
namespace Tests\Feature\SpendCaps;

use App\Models\{User, VibyraSession};
use App\Services\Membership\Enrollment;
use App\Services\Vibes\{Turns, Wallet};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Queue};
use Illuminate\Support\Str;
use Tests\TestCase;

/** A modern (billing v2) account with 1,000 tokens (10,000,000 units) and the caps flag on. */
abstract class SpendCapsTestCase extends TestCase
{
    use RefreshDatabase;
    protected User $user;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.key' => 'base64:'.base64_encode(str_repeat('a', 32)), 'spend_caps.enabled' => true, 'vibes.enabled' => true,
            'services.openrouter.key' => 'test-only', 'membership.free_enabled' => false, 'membership.enabled' => false,
            'vibes.daily_micro_usd_limit' => 100_000_000_000, 'intelligence.inbox' => true]);
        $this->user = User::factory()->create(['email_verified_at' => now(), 'credits_balance' => 0]);
        app(Wallet::class)->ensure($this->user, 0);
        app(Enrollment::class)->migrate($this->user, 0);
        app(Wallet::class)->grant($this->user->id, 'caps-test-funds', 'topup', 10_000_000);
        DB::table('vibes_wallets')->where('user_id', $this->user->id)->update(['consented_at' => now()]);
        VibyraSession::create(['user_id' => $this->user->id, 'token_hash' => hash('sha256', 'caps-session'), 'last_used_at' => now()]);
        $this->withToken('caps-session');
        Queue::fake();
    }

    /** Caps in whole tokens; omitted ones stay off. */
    protected function caps(?float $day = null, ?float $month = null, ?float $run = null, string $tz = 'UTC'): void
    {
        $u = fn (?float $t) => $t === null ? null : (int) round($t * 10000);
        DB::table('vibes_wallets')->where('user_id', $this->user->id)->update(['cap_day_units' => $u($day),
            'cap_month_units' => $u($month), 'cap_run_units' => $u($run), 'cap_timezone' => $tz]);
    }

    protected function quote(int $max, string $chat): array
    {
        return ['unitScale' => 10000, 'chatId' => $chat, 'model' => 'test', 'text' => 'Hi', 'request' => [],
            'expires' => now()->addMinute()->timestamp, 'revision' => 0, 'trial' => true, 'max' => $max, 'userId' => $this->user->id];
    }

    protected function chat(): string
    {
        $chat = (string) Str::uuid();
        DB::table('vibes_chats')->insert(['id' => $chat, 'user_id' => $this->user->id, 'title' => 'Test', 'created_at' => now(), 'updated_at' => now()]);
        return $chat;
    }

    /** Reserve `$max` units through the real admission path. */
    protected function submit(int $max = 100_000): object
    {
        return app(Turns::class)->submit($this->user->id, (string) Str::uuid(), $this->quote($max, $this->chat()));
    }

    protected function settle(object $turn, int $micro): void
    {
        app(Turns::class)->settle($turn->id, $micro, 'ok');
    }

    protected function row(string $kind = 'day'): object
    {
        return DB::table('wallet_spend_periods')->where('user_id', $this->user->id)->where('kind', $kind)->orderByDesc('starts_at')->firstOrFail();
    }

    protected function used(string $kind = 'day'): int
    {
        $r = $this->row($kind);
        return (int) $r->held + (int) $r->spent;
    }

    protected function balance(): int
    {
        return app(Wallet::class)->available($this->user->id);
    }
}
