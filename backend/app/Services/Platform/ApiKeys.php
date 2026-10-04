<?php

namespace App\Services\Platform;

use App\Models\ApiKey;
use App\Services\AgentRuns\ApiError;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * Personal API keys. The secret (`vyk_` + 40 letters/digits) is returned once, at creation; only its SHA-256 is stored, so a
 * database read cannot recover a key. A key carries scopes and its own per-minute budget. There is deliberately no scope for
 * approving a write, billing or key management: those only ever answer to the person's signed-in session.
 */
final class ApiKeys
{
    public const SCOPES = ['runs:read', 'runs:create', 'triggers:invoke', 'projects:read'];
    private const FORMAT = '/^vyk_[A-Za-z0-9]{40}$/D';

    public static function enabled(): bool
    {
        return (bool) config('platform.api_keys');
    }

    public static function hash(string $secret): string
    {
        return hash('sha256', $secret);
    }

    /** @return array{0: ApiKey, 1: string} the key and its secret, to be shown once */
    public function create(int $userId, string $name, array $scopes, ?int $rate = null): array
    {
        $scopes = array_values(array_unique($scopes));
        if ($scopes === [] || array_diff($scopes, self::SCOPES) !== [])
            ApiError::throw(422, 'invalid_scopes', 'Choose from: '.implode(', ', self::SCOPES).'.');
        $rate = max(1, min((int) config('platform.max_rate_per_minute'), $rate ?? (int) config('platform.default_rate_per_minute')));
        $secret = 'vyk_'.Str::random(40);
        $key = DB::transaction(function () use ($userId, $name, $scopes, $rate, $secret) {
            DB::table('users')->where('id', $userId)->lockForUpdate()->first(); // the cap is a count: count and insert under the user lock
            if (ApiKey::query()->where('user_id', $userId)->whereNull('revoked_at')->count() >= (int) config('platform.max_keys'))
                ApiError::throw(409, 'key_limit', 'Revoke a key before creating another.');
            return ApiKey::query()->create(['user_id' => $userId, 'name' => mb_substr(trim($name), 0, 60), 'prefix' => substr($secret, 0, 10),
                'key_hash' => self::hash($secret), 'scopes' => $scopes, 'rate_per_minute' => $rate]);
        });
        AccountActivity::record($userId, 'api_key.created', ['name' => $key->name, 'prefix' => $key->prefix, 'scopes' => $scopes]);
        return [$key, $secret];
    }

    public function revoke(int $userId, string $id): ApiKey
    {
        $key = ApiKey::query()->where('user_id', $userId)->whereKey($id)->first();
        if (!$key) ApiError::throw(404, 'key_not_found', 'That key does not exist.');
        if (!$key->revoked_at) {
            $key->forceFill(['revoked_at' => now()])->save();
            AccountActivity::record($userId, 'api_key.revoked', ['name' => $key->name, 'prefix' => $key->prefix]);
        }
        return $key;
    }

    /** @return ApiKey[] newest first */
    public function list(int $userId): array
    {
        return ApiKey::query()->where('user_id', $userId)->orderByDesc('created_at')->limit(50)->get()->all();
    }

    public function authenticate(string $secret): ?ApiKey
    {
        if (!preg_match(self::FORMAT, $secret)) return null;
        return ApiKey::query()->where('key_hash', self::hash($secret))->whereNull('revoked_at')->first();
    }

    /** Last-used time, written at most once per `key_touch_seconds` so reads do not become writes. */
    public function touch(ApiKey $key): void
    {
        $cut = now()->subSeconds((int) config('platform.key_touch_seconds'));
        ApiKey::query()->whereKey($key->id)->where(fn ($q) => $q->whereNull('last_used_at')->orWhere('last_used_at', '<', $cut))
            ->update(['last_used_at' => now()]);
    }

    /**
     * One request against the key's per-minute budget: a fixed 60-second window opened by the first request. The counter is the cache
     * driver's own atomic increment. Laravel's RateLimiter::hit is not used: its "expired between add and increment" repair does a put(1)
     * that, under parallel first requests, overwrites other workers' increments (the PostgreSQL harness showed 9 of 20 passing a budget of 5).
     * @return int seconds to wait when over budget, else 0
     */
    public function throttle(ApiKey $key): int
    {
        $bucket = 'platform-key:'.$key->id;
        Cache::add($bucket.':reset', now()->timestamp + 60, 60);
        Cache::add($bucket, 0, 60);
        $hits = Cache::increment($bucket);
        if ($hits === false) { // the window expired between add and increment: open a new one
            Cache::add($bucket, 0, 60);
            $hits = (int) Cache::increment($bucket);
        }
        return $hits > $key->rate_per_minute ? max(1, (int) Cache::get($bucket.':reset', now()->timestamp + 60) - now()->timestamp) : 0;
    }

    public function payload(ApiKey $key): array
    {
        return ['id' => $key->id, 'name' => $key->name, 'prefix' => $key->prefix, 'scopes' => $key->scopes,
            'ratePerMinute' => $key->rate_per_minute, 'lastUsedAt' => $key->last_used_at?->toIso8601String(),
            'revokedAt' => $key->revoked_at?->toIso8601String(), 'createdAt' => $key->created_at?->toIso8601String()];
    }
}
