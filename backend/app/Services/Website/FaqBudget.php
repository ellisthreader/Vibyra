<?php

namespace App\Services\Website;

use Illuminate\Support\Facades\Cache;
use RuntimeException;

/** Every provider attempt reserves a daily call and budget before any network I/O. */
final class FaqBudget
{
    public function run(callable $request): mixed
    {
        $store = (string) config('website_faq.cache_store', 'database');
        if (app()->environment('production') && !in_array(config("cache.stores.{$store}.driver"), ['database', 'redis'], true)) {
            throw new RuntimeException('FAQ needs a shared budget store.');
        }
        $cache = Cache::store($store);
        $slot = null;
        for ($i = 0; $i < min(4, max(0, (int) config('website_faq.concurrent_calls'))); $i++) {
            $candidate = $cache->lock('website-faq:slot:'.$i, 120);
            if ($candidate->get()) { $slot = $candidate; break; }
        }
        if (!$slot) throw new RuntimeException('FAQ is busy.');
        try {
            $lock = $cache->lock('website-faq:budget-lock', 10);
            if (!$lock->get()) throw new RuntimeException('FAQ budget is busy.');
            try {
                $key = 'website-faq:budget:'.now('UTC')->format('Y-m-d');
                $usage = $cache->get($key, ['calls' => 0, 'reserved' => 0]);
                $reserve = max(100000, (int) config('website_faq.call_reserve_micro_usd'));
                if ($usage['calls'] >= min(1000, max(0, (int) config('website_faq.daily_calls')))
                    || $usage['reserved'] + $reserve > max(0, (int) config('website_faq.daily_budget_micro_usd'))) {
                    throw new RuntimeException('FAQ daily budget reached.');
                }
                $saved = $cache->put($key, ['calls' => $usage['calls'] + 1, 'reserved' => $usage['reserved'] + $reserve], now('UTC')->addDays(2));
                if (!$saved) throw new RuntimeException('FAQ budget unavailable.');
            } finally { $lock->release(); }
            return $request();
        } finally { $slot->release(); }
    }
}
