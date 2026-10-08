<?php
namespace App\Services\Decisions;
use Illuminate\Support\Facades\{Cache, Http};
final class ProviderKeyPolicy
{
    public function assertSafe(): void
    {
        $key = (string) config('intelligence.jev_key');
        if (!$key || (config('services.openrouter.key') && hash_equals((string) config('services.openrouter.key'), $key))) {
            throw new \RuntimeException('dedicated_key_required');
        }
        $cache = 'jev:key-policy:'.hash('sha256', $key);
        $ceiling = max(0, (int) config('intelligence.total_micro_usd')) / 1000000;
        $safe = Cache::remember($cache.':'.$ceiling, 30, function () use ($key, $ceiling) {
            try {
                $r = Http::withToken($key)->acceptJson()->withoutRedirecting()->connectTimeout(1)->timeout(1)
                    ->get('https://openrouter.ai/api/v1/key');
                $d = $r->json('data');
                return $r->successful() && is_array($d) && is_numeric($d['limit'] ?? null)
                    && $d['limit'] > 0 && $d['limit'] <= $ceiling
                    && array_key_exists('limit_reset', $d) && $d['limit_reset'] === null
                    && is_numeric($d['limit_remaining'] ?? null) && $d['limit_remaining'] >= config('intelligence.call_reserve_micro_usd') / 1000000
                    && ($d['is_management_key'] ?? true) === false && ($d['is_provisioning_key'] ?? true) === false
                    && ($d['include_byok_in_limit'] ?? false) === true;
            } catch (\Throwable) { return false; }
        });
        if (!$safe) throw new \RuntimeException('provider_budget_not_verified');
    }
}
