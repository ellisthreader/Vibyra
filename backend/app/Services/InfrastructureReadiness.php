<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Throwable;

class InfrastructureReadiness
{
    public function check(): array
    {
        $checks = [];

        if (config('readiness.database.enabled')) {
            $checks['database'] = $this->probe(function (): void {
                DB::connection(config('readiness.database.connection'))->select('select 1');
            });
        }

        if (config('readiness.cache.enabled')) {
            $checks['cache'] = $this->probe(function (): void {
                $cache = Cache::store(config('readiness.cache.store'));
                $key = 'readiness:'.bin2hex(random_bytes(8));
                $cache->put($key, 'ok', 10);

                try {
                    if ($cache->get($key) !== 'ok') {
                        throw new \RuntimeException('Cache probe value was not readable.');
                    }
                } finally {
                    $cache->forget($key);
                }
            });
        }

        if (config('readiness.storage.enabled')) {
            $checks['storage'] = $this->probe(function (): void {
                $disk = Storage::disk(config('readiness.storage.disk'));
                $path = 'readiness/'.bin2hex(random_bytes(8));

                if (! $disk->put($path, 'ok')) {
                    throw new \RuntimeException('Storage probe could not write.');
                }

                try {
                    if ($disk->get($path) !== 'ok') {
                        throw new \RuntimeException('Storage probe value was not readable.');
                    }
                } finally {
                    $disk->delete($path);
                }
            });
        }

        return [
            'ok' => collect($checks)->every(fn (array $check) => $check['ok']),
            'checks' => $checks,
        ];
    }

    private function probe(callable $callback): array
    {
        try {
            $callback();

            return ['ok' => true];
        } catch (Throwable) {
            return ['ok' => false];
        }
    }
}
