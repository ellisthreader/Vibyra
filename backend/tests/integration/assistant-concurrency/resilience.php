<?php
// Part 15: the provider-failover breaker and a retried Vibes turn, raced on PostgreSQL. Required by run.php, which defines
// check(), race(), successes() and account(). The cache store is switched to the database so forked workers share state.
use App\Jobs\RunVibesTurn;
use App\Services\ModelResilience\ProviderBreaker;
use App\Services\Vibes\{Turns, Wallet};
use Illuminate\Support\Facades\{Cache, DB, Http};
use Illuminate\Support\Str;

config(['cache.default' => 'database', 'model_resilience.failover.enabled' => true, 'model_resilience.prompt_caching.enabled' => true,
    'model_resilience.failover.breaker' => ['threshold' => 5, 'window' => 60, 'cooldown' => 4, 'probe_ttl' => 30]]);
app('cache')->forgetDriver();
Cache::flush();
$breaker = app(ProviderBreaker::class);
// The cache store keeps its own connection object; drop it before forking so every worker opens its own socket.
function crace(array $jobs): array { Cache::store('database')->getStore()->getConnection()->disconnect(); return race($jobs); }
$fails = fn (string $key) => (int) Cache::get('model-breaker:'.hash('sha256', $key).':fails', 0);

// 1. Racing failures neither lose increments (the RateLimiter::hit overwrite) nor open early.
$r = crace(array_fill(0, 4, fn () => $breaker->failure('race-a')));
check(successes($r) === 4 && $fails('race-a') === 4 && $breaker->state('race-a') === 'closed', 'four racing failures are counted exactly, below the threshold of five');
$r = crace(array_fill(0, 12, fn () => $breaker->failure('race-b')));
check(successes($r) === 12 && $breaker->state('race-b') === 'open', 'twelve racing failures open the breaker (the counter is not reset by the race)');

// 2. After the cooldown exactly one of many concurrent requests is the half-open probe.
sleep(5);
check($breaker->state('race-b') === 'half_open', 'the cooldown ends in half-open');
$r = crace(array_fill(0, 10, function () use ($breaker) { if (!$breaker->allow('race-b')) throw new RuntimeException('refused'); }));
check(successes($r) === 1, 'ten racing requests: exactly one half-open probe is let through');
$breaker->success('race-b');
check($breaker->state('race-b') === 'closed' && $breaker->allow('race-b'), 'a successful probe closes the breaker');

// 3. A turn whose first provider call fails and is retried, racing duplicate jobs and a recovery-style settlement.
Cache::put((string) config('billing.openrouter_pricing.cache_key'), ['synced_at' => now()->toIso8601String(), 'models' => [
    'qwen/qwen3.8-flash' => ['pricing' => ['prompt' => '0.00000015', 'completion' => '0.00000047'], 'supported_parameters' => ['tools'], 'context_length' => 200000],
    'google/gemini-3.8-flash' => ['pricing' => ['prompt' => '0.0000001', 'completion' => '0.0000004'], 'supported_parameters' => ['tools'], 'context_length' => 200000]]], 3600);
config(['vibes.enabled' => true, 'services.openrouter.key' => 'fixture-only', 'vibes.plans.free.concurrentReplies' => 50]);
$calls = tempnam(sys_get_temp_dir(), 'resilience-calls-');
Http::fake(['*' => function () use ($calls) {
    $h = fopen($calls, 'c+'); flock($h, LOCK_EX); $n = (int) stream_get_contents($h) + 1; ftruncate($h, 0); rewind($h); fwrite($h, (string) $n); flock($h, LOCK_UN); fclose($h);
    return $n === 1 ? Http::response(['error' => ['message' => 'Provider returned error', 'metadata' => ['provider_name' => 'Stub']]], 503)
        : Http::response(['id' => 'gen-race', 'choices' => [['message' => ['content' => 'Done.']]], 'usage' => ['cost' => 0.0004, 'prompt_tokens_details' => ['cached_tokens' => 10]]]);
}]);
function funded(int $max): array {
    $u = account(100000); $chat = (string) Str::uuid(); $id = (string) Str::uuid();
    DB::table('vibes_wallets')->where('user_id', $u->id)->update(['consented_at' => now()]);
    DB::table('vibes_chats')->insert(['id' => $chat, 'user_id' => $u->id, 'title' => 'QA', 'created_at' => now(), 'updated_at' => now()]);
    $q = ['unitScale' => 10000, 'chatId' => $chat, 'model' => 'qwen/qwen3.8-flash', 'text' => 'Hi', 'expires' => now()->addMinute()->timestamp,
        'revision' => 0, 'trial' => false, 'max' => $max, 'request' => ['model' => 'qwen/qwen3.8-flash', 'max_tokens' => 400,
            'messages' => [['role' => 'system', 'content' => 'Rules.'], ['role' => 'user', 'content' => 'Hi']], 'usage' => ['include' => true],
            'provider' => ['require_parameters' => true, 'allow_fallbacks' => false, 'max_price' => ['prompt' => 0.15, 'completion' => 0.47]]]];
    app(Turns::class)->submit($u->id, $id, $q);
    return [$u, $id];
}
function settlements(string $id): int { return DB::table('vibes_ledger')->where('reference', 'settle:'.$id)->count(); }

[$u, $id] = funded(500);
$r = crace(array_fill(0, 3, fn () => app()->call([new RunVibesTurn($id), 'handle'])));
$t = DB::table('vibes_turns')->where('id', $id)->first();
check(successes($r) === 3 && (int) file_get_contents($calls) === 2, 'three duplicate jobs make exactly two provider calls (one failure, one retry), never repeating the retry');
check($t->status === 'completed' && $t->served_model === 'google/gemini-3.8-flash' && settlements($id) === 1, 'the retried turn completed on the same-tier model and settled once');
check((int) $t->charged === 400 && (int) $t->cache_read_tokens === 10, 'charged the settled cost only (0.0004 USD = 400 micro-units) and recorded the cache-read tokens');
check(DB::table('vibes_spend_days')->where('held', '<', 0)->count() === 0 && (int) DB::table('vibes_turns')->where('id', $id)->value('step_count') === 1, 'the retry is one step and holds never go negative');

// A recovery settlement racing the retry's own settlement: one receipt, one refund, whichever wins.
file_put_contents($calls, '0');
[$u, $id] = funded(500);
$r = crace([fn () => app()->call([new RunVibesTurn($id), 'handle']),
    fn () => app(Turns::class)->settle($id, null, null, 'Latest usage could not be confirmed. Only earlier confirmed usage was charged.', true),
    fn () => app(Turns::class)->settle($id, null, null, 'Latest usage could not be confirmed. Only earlier confirmed usage was charged.', true)]);
$t = DB::table('vibes_turns')->where('id', $id)->first();
check(successes($r) === 3 && settlements($id) === 1 && $t->settled_at !== null, 'a retry racing two recovery settlements yields exactly one settlement receipt');
check(app(Wallet::class)->available($u->id) >= 100000 - 500 && app(Wallet::class)->available($u->id) <= 100000, 'the wallet reflects one charge or one full refund, never both or neither');
check(DB::table('vibes_spend_days')->where('held', '<', 0)->orWhere('spent', '<', 0)->count() === 0, 'spend-day counters stay non-negative after the race');
unlink($calls);
