<?php

namespace App\Services\Billing;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Throwable;

class OpenRouterPricingCatalog
{
    public function __construct(private readonly OpenRouterPricingNormalizer $normalizer)
    {
    }

    public function sync(): array
    {
        $models = $this->fetchUserModels() ?? $this->fetchAllModels();
        if ($models === null) {
            throw new RuntimeException('OpenRouter pricing sync failed; the last-known-good catalog was preserved.');
        }

        $snapshot = [
            'synced_at' => now()->toIso8601String(),
            'models' => $models,
        ];

        Cache::put($this->snapshotCacheKey(), $snapshot, $this->maxStaleSeconds());

        return $snapshot;
    }

    public function snapshot(): ?array
    {
        $snapshot = Cache::get($this->snapshotCacheKey());

        return $this->validSnapshot($snapshot) ? $snapshot : null;
    }

    public function all(): array
    {
        return $this->snapshot()['models'] ?? [];
    }

    public function pricingFor(string $slug): ?array
    {
        $model = $this->all()[trim($slug)] ?? null;

        return is_array($model) ? $model['pricing'] : null;
    }

    public function modelPricing(string $slug): ?array
    {
        return $this->pricingFor($slug);
    }

    public function freshPricingFor(string $slug): ?array
    {
        return $this->isStale() ? null : $this->pricingFor($slug);
    }

    public function refreshPricingFor(string $slug): ?array
    {
        $slug = trim($slug);
        if (! $this->validModelSlug($slug)) {
            return null;
        }

        $pricing = $this->freshPricingFor($slug);
        if (is_array($pricing)) {
            return $pricing;
        }
        if (Cache::get($this->modelMissCacheKey($slug)) === true) {
            return null;
        }

        try {
            $pricing = Cache::lock(
                $this->syncLockCacheKey(),
                $this->timeoutSeconds() + 5,
            )->block($this->timeoutSeconds() + 5, function () use ($slug) {
                $current = $this->freshPricingFor($slug);
                if (is_array($current)) {
                    return $current;
                }

                try {
                    $this->sync();
                } catch (RuntimeException) {
                    return null;
                }

                return $this->freshPricingFor($slug);
            });
        } catch (Throwable) {
            $pricing = $this->freshPricingFor($slug);
        }

        if (! is_array($pricing)) {
            Cache::put(
                $this->modelMissCacheKey($slug),
                true,
                $this->modelMissSeconds(),
            );
            return null;
        }

        Cache::forget($this->modelMissCacheKey($slug));

        return $pricing;
    }

    public function supportsTerminalToolCalling(string $slug): bool
    {
        if ($this->isStale() || ! isset($this->all()[trim($slug)])) {
            $this->refreshPricingFor($slug);
        }
        $model = $this->all()[trim($slug)] ?? null;
        $parameters = is_array($model) ? ($model['supported_parameters'] ?? null) : null;

        return is_array($parameters) && in_array('tools', $parameters, true);
    }

    public function isStale(): bool
    {
        $snapshot = $this->snapshot();
        if ($snapshot === null) {
            return true;
        }

        try {
            return Carbon::parse($snapshot['synced_at'])
                ->addSeconds($this->ttlSeconds())
                ->isPast();
        } catch (Throwable) {
            return true;
        }
    }

    public function status(): array
    {
        $snapshot = $this->snapshot();

        return [
            'stale' => $this->isStale(),
            'synced_at' => $snapshot['synced_at'] ?? null,
            'count' => count($snapshot['models'] ?? []),
        ];
    }

    private function fetchUserModels(): ?array
    {
        $apiKey = trim((string) config('services.openrouter.key', ''));
        if ($apiKey === '') {
            return null;
        }

        try {
            $response = Http::acceptJson()
                ->withToken($apiKey)
                ->timeout($this->timeoutSeconds())
                ->get($this->syncUrl());

            return $this->normalizer->fromResponse($response);
        } catch (Throwable) {
            return null;
        }
    }

    private function fetchAllModels(): ?array
    {
        try {
            $response = Http::acceptJson()
                ->timeout($this->timeoutSeconds())
                ->get($this->fallbackSyncUrl());

            return $this->normalizer->fromResponse($response);
        } catch (Throwable) {
            return null;
        }
    }

    private function validSnapshot(mixed $snapshot): bool
    {
        return is_array($snapshot)
            && is_string($snapshot['synced_at'] ?? null)
            && is_array($snapshot['models'] ?? null);
    }

    private function snapshotCacheKey(): string
    {
        return $this->stringConfig('cache_key', 'billing:openrouter-pricing:v1');
    }

    private function ttlSeconds(): int
    {
        return max(1, $this->integerConfig('ttl_seconds', 21600));
    }

    private function maxStaleSeconds(): int
    {
        return max($this->ttlSeconds(), $this->integerConfig('max_stale_seconds', 86400));
    }

    private function timeoutSeconds(): int
    {
        return max(1, $this->integerConfig('timeout_seconds', 15));
    }

    private function modelMissSeconds(): int
    {
        return max(1, $this->integerConfig('model_miss_seconds', 60));
    }

    private function syncLockCacheKey(): string
    {
        return $this->snapshotCacheKey().':sync-lock';
    }

    private function modelMissCacheKey(string $slug): string
    {
        return $this->snapshotCacheKey().':model-miss:'.hash('sha256', $slug);
    }

    private function validModelSlug(string $slug): bool
    {
        return strlen($slug) <= 255
            && preg_match('/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i', $slug) === 1;
    }

    private function syncUrl(): string
    {
        return $this->stringConfig('sync_url', 'https://openrouter.ai/api/v1/models/user');
    }

    private function fallbackSyncUrl(): string
    {
        return $this->stringConfig(
            'fallback_sync_url',
            'https://openrouter.ai/api/v1/models?output_modalities=all',
        );
    }

    private function stringConfig(string $key, string $default): string
    {
        $value = config("billing.openrouter_pricing.{$key}");

        return is_string($value) && trim($value) !== '' ? trim($value) : $default;
    }

    private function integerConfig(string $key, int $default): int
    {
        $value = config("billing.openrouter_pricing.{$key}");

        return is_numeric($value) ? (int) $value : $default;
    }
}
