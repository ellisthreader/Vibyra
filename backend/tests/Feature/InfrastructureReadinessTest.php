<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class InfrastructureReadinessTest extends TestCase
{
    public function test_readiness_checks_the_database_without_replacing_liveness(): void
    {
        $this->getJson('/up')->assertOk();

        $this->getJson('/ready')
            ->assertOk()
            ->assertHeaderMissing('set-cookie')
            ->assertExactJson([
                'ok' => true,
                'checks' => ['database' => ['ok' => true]],
            ]);
    }

    public function test_optional_cache_and_storage_checks_can_be_enabled(): void
    {
        Storage::fake('local');
        config([
            'readiness.cache.enabled' => true,
            'readiness.cache.store' => 'array',
            'readiness.storage.enabled' => true,
            'readiness.storage.disk' => 'local',
        ]);

        $this->getJson('/ready')
            ->assertOk()
            ->assertJsonPath('checks.cache.ok', true)
            ->assertJsonPath('checks.storage.ok', true);
    }

    public function test_readiness_returns_service_unavailable_when_a_required_check_fails(): void
    {
        config(['readiness.database.connection' => 'missing']);

        $this->getJson('/ready')
            ->assertStatus(503)
            ->assertJsonPath('ok', false)
            ->assertJsonPath('checks.database.ok', false);
    }
}
