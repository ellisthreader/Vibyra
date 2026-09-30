<?php

namespace Tests\Feature;

use App\Http\Middleware\LocalOwnerAccess;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LocalOwnerAccessTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(PreventRequestForgery::class);
    }

    public function test_one_click_owner_uses_a_local_session_and_real_snapshot_only(): void
    {
        $this->app->detectEnvironment(fn (): string => 'local');
        config(['owner_analytics.emails' => []]);
        $path = tempnam(sys_get_temp_dir(), 'owner-snapshot-');
        $this->assertNotFalse($path);
        file_put_contents($path, json_encode([
            'schema_version' => 1,
            'source' => 'production',
            'captured_at' => '2026-09-26T09:26:01Z',
            'availability' => ['vibes_turns' => true],
            'periods' => ['30' => [
                'range' => ['days' => 30, 'from' => '2026-08-28T00:00:00Z', 'to' => '2026-09-26T09:26:01Z'],
                'accounts' => ['total' => 48, 'registered' => 22, 'guests' => 26, 'new' => 40, 'active_30d' => 42],
                'ai' => ['vibes_turns' => 18, 'completed_turns' => 16, 'failed_turns' => 2, 'spend_micro_usd' => 91411],
                'memberships' => [['plan' => 'free', 'count' => 22]],
                'prompt_models' => [['model' => 'test/model', 'count' => 18]],
            ]],
        ], JSON_THROW_ON_ERROR));
        config(['owner_analytics.production_snapshot_path' => $path]);

        try {
            $this->get('/owner/login')->assertOk()->assertSee('local-owner-access');
            $this->postJson('/web-api/owner/local-login')->assertOk()->assertJsonPath('next', '/owner');
            $this->assertDatabaseHas('users', ['email' => LocalOwnerAccess::EMAIL]);
            $this->get('/owner')->assertOk();
            $this->getJson('/web-api/owner/analytics?days=30')->assertOk()
                ->assertJsonPath('overview.accounts.total', 48)
                ->assertJsonPath('overview.ai.vibes_turns', 18)
                ->assertJsonPath('overview.website.page_views', null)
                ->assertJsonPath('data_quality.source', 'production')
                ->assertJsonPath('data_quality.captured_at', '2026-09-26T09:26:01Z');
            $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.8'])
                ->get('/owner')->assertForbidden();
        } finally {
            unlink($path);
        }
    }

    public function test_local_owner_button_and_endpoint_are_hidden_outside_local_loopback_sqlite(): void
    {
        $this->app->detectEnvironment(fn (): string => 'production');
        $this->get('/owner/login')->assertDontSee('local-owner-access');
        $this->postJson('/web-api/owner/local-login')->assertNotFound();

        $this->app->detectEnvironment(fn (): string => 'local');
        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.8'])
            ->postJson('/web-api/owner/local-login')->assertNotFound();
        config(['database.default' => 'pgsql']);
        try {
            $this->withServerVariables(['REMOTE_ADDR' => '127.0.0.1'])
                ->postJson('/web-api/owner/local-login')->assertNotFound();
        } finally {
            config(['database.default' => 'sqlite']);
        }
    }

    public function test_version_two_snapshot_displays_production_surface_aggregates_only(): void
    {
        $this->app->detectEnvironment(fn (): string => 'local');
        $path = tempnam(sys_get_temp_dir(), 'owner-snapshot-');
        $this->assertNotFalse($path);
        file_put_contents($path, json_encode([
            'schema_version' => 2, 'source' => 'production', 'captured_at' => '2026-09-26T12:00:00Z',
            'availability' => ['vibes_turns' => true],
            'tracking_by_surface' => ['website' => '2026-09-26T11:00:00Z', 'desktop' => null, 'mobile' => null],
            'periods' => ['30' => [
                'range' => ['days' => 30, 'from' => '2026-08-28T00:00:00Z', 'to' => '2026-09-26T12:00:00Z'],
                'accounts' => ['total' => 2, 'registered' => 2, 'guests' => 0, 'new' => 1, 'active_30d' => 1],
                'ai' => ['vibes_turns' => 0, 'completed_turns' => 0, 'failed_turns' => 0, 'spend_micro_usd' => 0],
                'memberships' => [], 'prompt_models' => [],
                'operations' => ['accounts_used_24h' => 1, 'accounts_used_7d' => 2,
                    'cloud_users' => 1, 'new_registered' => 1,
                    'cloud_last_turn_at' => '2026-09-26T11:30:00Z'],
                'cloud_series' => [['date' => '2026-09-26', 'turns' => 3, 'users' => 1]],
                'analytics' => [
                    'overview' => ['website' => ['page_views' => 3, 'engaged_seconds' => 25],
                        'desktop' => ['app_opens' => null], 'mobile' => ['app_opens' => null]],
                    'series' => ['website' => [['date' => '2026-09-26', 'page_views' => 3]],
                        'desktop' => [], 'mobile' => []],
                    'breakdowns' => ['website_ctas' => [['action' => 'nav_downloads', 'count' => 2]]],
                ],
            ]],
        ], JSON_THROW_ON_ERROR));
        config(['owner_analytics.production_snapshot_path' => $path]);
        try {
            $this->postJson('/web-api/owner/local-login')->assertOk();
            $this->getJson('/web-api/owner/analytics?days=30')->assertOk()
                ->assertJsonPath('overview.website.page_views', 3)
                ->assertJsonPath('overview.website.engaged_seconds', 25)
                ->assertJsonPath('overview.desktop.app_opens', null)
                ->assertJsonPath('overview.operations.cloud_users', 1)
                ->assertJsonPath('overview.operations.accounts_used_24h', 1)
                ->assertJsonPath('series.cloud.0.turns', 3)
                ->assertJsonPath('breakdowns.website_ctas.0.count', 2)
                ->assertJsonPath('data_quality.tracking_by_surface.website', '2026-09-26T11:00:00Z');
        } finally {
            unlink($path);
        }
    }
}
