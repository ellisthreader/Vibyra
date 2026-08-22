<?php

namespace App\Services;

use League\Flysystem\AwsS3V3\AwsS3V3Adapter;
use Predis\Client;

class InfrastructurePreflight
{
    public function inspect(): array
    {
        return array_values(array_filter([
            $this->productionDatabaseIssue(),
            $this->productionDebugIssue(),
            $this->productionUrlIssue(),
            $this->redisClientIssue(),
            $this->objectStorageIssue(),
            $this->runtimeQueueIssue(),
            $this->loggingIssue(),
        ]));
    }

    private function productionDatabaseIssue(): ?array
    {
        if (! app()->environment('production') || config('database.default') !== 'sqlite') {
            return null;
        }

        return $this->error('database', 'Production must use a transactional managed database, not SQLite.');
    }

    private function productionDebugIssue(): ?array
    {
        return app()->environment('production') && config('app.debug')
            ? $this->error('debug', 'APP_DEBUG must be false in production.')
            : null;
    }

    private function productionUrlIssue(): ?array
    {
        $url = (string) config('app.url');

        return app()->environment('production') && ! str_starts_with($url, 'https://')
            ? $this->error('app_url', 'APP_URL must use HTTPS in production.')
            : null;
    }

    private function redisClientIssue(): ?array
    {
        if (! $this->usesRedis()) {
            return null;
        }

        $client = config('database.redis.client');
        if ($client === 'phpredis' && ! extension_loaded('redis')) {
            return $this->error('redis', 'The phpredis client is selected but ext-redis is not loaded.');
        }
        if ($client === 'predis' && ! class_exists(Client::class)) {
            return $this->error('redis', 'The Predis client is selected but predis/predis is not installed.');
        }

        return null;
    }

    private function objectStorageIssue(): ?array
    {
        $disks = [
            config('filesystems.default'),
            config('readiness.storage.disk'),
        ];
        if (in_array(config('deployment_artifacts.mode'), ['dual', 'object'], true)) {
            $disks[] = config('deployment_artifacts.disk');
        }
        $usesS3 = collect($disks)->filter()->contains(
            fn ($disk) => config("filesystems.disks.{$disk}.driver") === 's3'
        );

        return $usesS3 && ! class_exists(AwsS3V3Adapter::class)
            ? $this->error('storage', 'An S3 disk is selected but the S3 Flysystem adapter is not installed.')
            : null;
    }

    private function loggingIssue(): ?array
    {
        return app()->environment('production') && config('logging.default') !== 'stderr'
            ? ['level' => 'warning', 'code' => 'logging', 'message' => 'Use LOG_CHANNEL=stderr on ephemeral compute.']
            : null;
    }

    private function runtimeQueueIssue(): ?array
    {
        if (! config('runtime_deployments.queue_enabled')) {
            return null;
        }
        if (config('queue.default') !== 'redis') {
            return $this->error('runtime_queue', 'Queued runtime deployments require QUEUE_CONNECTION=redis.');
        }

        $retryAfter = (int) config('queue.connections.redis.retry_after');
        $timeout = (int) config('runtime_deployments.job_timeout', 1200);

        return $retryAfter <= $timeout
            ? $this->error('runtime_queue', 'Redis retry_after must be greater than the runtime deployment job timeout.')
            : null;
    }

    private function usesRedis(): bool
    {
        return config('cache.default') === 'redis'
            || config('session.driver') === 'redis'
            || config('queue.default') === 'redis';
    }

    private function error(string $code, string $message): array
    {
        return ['level' => 'error', 'code' => $code, 'message' => $message];
    }
}
