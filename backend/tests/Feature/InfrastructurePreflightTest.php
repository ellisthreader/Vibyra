<?php

namespace Tests\Feature;

use League\Flysystem\AwsS3V3\AwsS3V3Adapter;
use Tests\TestCase;

class InfrastructurePreflightTest extends TestCase
{
    public function test_local_defaults_remain_usable(): void
    {
        $this->artisan('vibyra:infrastructure-preflight')->assertSuccessful();
    }

    public function test_unsafe_production_configuration_fails_before_deployment(): void
    {
        app()->detectEnvironment(fn () => 'production');
        config([
            'database.default' => 'sqlite',
            'app.debug' => true,
            'app.url' => 'http://localhost',
        ]);

        $this->artisan('vibyra:infrastructure-preflight')
            ->expectsOutputToContain('[database]')
            ->expectsOutputToContain('[debug]')
            ->expectsOutputToContain('[app_url]')
            ->assertFailed();
    }

    public function test_strict_mode_treats_production_recommendations_as_failures(): void
    {
        app()->detectEnvironment(fn () => 'production');
        config([
            'database.default' => 'pgsql',
            'app.debug' => false,
            'app.url' => 'https://vibyra.example',
            'logging.default' => 'stack',
        ]);

        $this->artisan('vibyra:infrastructure-preflight --strict')
            ->expectsOutputToContain('[logging]')
            ->assertFailed();
    }

    public function test_missing_selected_redis_runtime_fails_preflight(): void
    {
        if (extension_loaded('redis')) {
            $this->markTestSkipped('The current PHP runtime already provides ext-redis.');
        }

        config([
            'cache.default' => 'redis',
            'database.redis.client' => 'phpredis',
        ]);

        $this->artisan('vibyra:infrastructure-preflight')
            ->expectsOutputToContain('[redis]')
            ->assertFailed();
    }

    public function test_runtime_queue_requires_redis_with_a_safe_retry_window(): void
    {
        config([
            'runtime_deployments.queue_enabled' => true,
            'queue.default' => 'database',
        ]);
        $this->artisan('vibyra:infrastructure-preflight')
            ->expectsOutputToContain('[runtime_queue]')
            ->assertFailed();

        config([
            'queue.default' => 'redis',
            'database.redis.client' => extension_loaded('redis') ? 'phpredis' : 'unsupported-test-client',
            'queue.connections.redis.retry_after' => 90,
        ]);
        $this->artisan('vibyra:infrastructure-preflight')
            ->expectsOutputToContain('[runtime_queue]')
            ->assertFailed();
    }

    public function test_object_artifact_mode_requires_the_s3_adapter(): void
    {
        if (class_exists(AwsS3V3Adapter::class)) {
            $this->markTestSkipped('The current installation already provides the S3 adapter.');
        }

        config([
            'deployment_artifacts.mode' => 'dual',
            'deployment_artifacts.disk' => 's3',
        ]);

        $this->artisan('vibyra:infrastructure-preflight')
            ->expectsOutputToContain('[storage]')
            ->assertFailed();
    }
}
