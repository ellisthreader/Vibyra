<?php
// Included only by the disposable PostgreSQL membership harness (race/check are defined there).
use App\Services\Vibes\DirectTurns;
use Illuminate\Support\Facades\Cache;
config(['services.openrouter.key' => 'fixture-only', 'vibes.max_output_tokens' => 4096]);
Cache::put((string) config('billing.openrouter_pricing.cache_key'), ['synced_at' => now()->toIso8601String(), 'models' => [
    'qwen/qwen3.8-flash' => ['pricing' => ['prompt' => '0.00000015', 'completion' => '0.00000047'], 'supported_parameters' => ['tools', 'max_tokens']],
]]);
$directUser = App\Models\User::factory()->create(['email_verified_at' => now(), 'credits_balance' => 0]);
app(App\Services\Vibes\Wallet::class)->ensure($directUser, 0);
app(App\Services\Membership\Enrollment::class)->migrate($directUser, 0);
Illuminate\Support\Facades\DB::table('vibes_wallets')->where('user_id', $directUser->id)->update(['consented_at' => now()]);
Illuminate\Support\Facades\DB::table('vibes_grants')->insert(['user_id' => $directUser->id, 'reference' => 'direct-race', 'kind' => 'topup',
    'amount' => 1000, 'remaining' => 1000, 'created_at' => now(), 'updated_at' => now()]);
$directChat = (string) Illuminate\Support\Str::uuid();
Illuminate\Support\Facades\DB::table('vibes_chats')->insert(['id' => $directChat, 'user_id' => $directUser->id, 'title' => 'Direct race', 'created_at' => now(), 'updated_at' => now()]);
$directId = (string) Illuminate\Support\Str::uuid();
$directMessage = ['chatId' => $directChat, 'text' => 'Hello', 'model' => 'qwen/qwen3.8-flash'];
$r = race(array_fill(0, 4, fn () => app(DirectTurns::class)->submit($directUser->id, $directId, $directMessage)));
check(count(array_filter($r, fn ($v) => $v['ok'])) === 4
    && Illuminate\Support\Facades\DB::table('vibes_turns')->where('id', $directId)->count() === 1
    && app(App\Services\Vibes\Wallet::class)->available($directUser->id) === 0, 'four direct sends admit and reserve once');
$r = race([fn () => app(DirectTurns::class)->submit($directUser->id, $directId, $directMessage),
    fn () => app(DirectTurns::class)->submit($directUser->id, $directId, [...$directMessage, 'text' => 'Changed'])]);
check($r[0]['ok'] && !$r[1]['ok'] && $r[1]['status'] === 409, 'changed direct message cannot reuse an admitted identity');
