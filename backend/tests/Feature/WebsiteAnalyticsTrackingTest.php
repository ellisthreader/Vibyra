<?php

namespace Tests\Feature;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class WebsiteAnalyticsTrackingTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_available_downloads_and_successful_web_signups_are_counted(): void
    {
        Storage::fake('analytics-releases');
        config([
            'releases.disk' => 'analytics-releases',
            'releases.platforms.windows' => [
                'label' => 'Windows', 'version' => '1.0.0',
                'path' => 'private/Vibyra.exe', 'filename' => 'Vibyra.exe',
                'size_bytes' => 6, 'sha256' => hash('sha256', 'binary'),
                'expected_extension' => 'exe', 'require_complete_metadata' => true,
            ],
        ]);
        $this->get('/downloads/windows')->assertStatus(503);
        $this->assertDatabaseMissing('analytics_events', ['event' => 'website_download']);

        Storage::disk('analytics-releases')->put('private/Vibyra.exe', 'binary');
        $this->get('/downloads/windows')->assertOk();
        $this->assertDatabaseHas('analytics_events', [
            'event' => 'website_download', 'dimension' => 'windows',
            'visitor_hash' => null, 'user_id' => null,
        ]);

        $this->postJson('/web-api/auth/signup', [
            'name' => 'New Member', 'email' => 'new@example.test', 'password' => 'secret123',
        ])->assertCreated();
        $this->assertDatabaseCount('analytics_events', 2);
        $this->assertDatabaseHas('analytics_events', [
            'event' => 'website_signup', 'visitor_hash' => null, 'user_id' => null,
        ]);
    }

    public function test_page_tracking_requires_server_held_consent_and_withdrawal_erases_events(): void
    {
        $this->get('/')->assertOk();
        $this->withUnencryptedCookie('vibyra_analytics', 'allow')->get('/downloads')->assertOk();
        $this->assertDatabaseCount('analytics_events', 0);
        $this->getJson('/web-api/analytics/consent')->assertOk()->assertJsonPath('choice', 'unknown');
        $this->postJson('/web-api/analytics/event', [
            'event' => 'website_page_view', 'event_id' => (string) Str::uuid(), 'dimension' => '/',
        ])->assertForbidden();
        $this->putJson('/web-api/analytics/consent', ['choice' => 'aggregate', 'policy_version' => 1])
            ->assertOk()->assertJsonPath('choice', 'aggregate');
        $this->get('/')->assertOk();
        $this->assertDatabaseCount('analytics_events', 1);
        $this->assertNotNull(DB::table('analytics_events')->value('visitor_hash'));
        $this->assertNull(DB::table('analytics_events')->value('user_id'));
        $this->putJson('/web-api/analytics/consent', ['choice' => 'declined', 'policy_version' => 1])
            ->assertOk()->assertJsonPath('choice', 'declined');
        $this->assertDatabaseCount('analytics_events', 0);
        $this->get('/')->assertOk();
        $this->assertDatabaseCount('analytics_events', 0);
    }

    public function test_named_clicks_and_engagement_are_allowlisted_and_idempotent(): void
    {
        $this->putJson('/web-api/analytics/consent', ['choice' => 'aggregate', 'policy_version' => 1])->assertOk();
        $id = (string) Str::uuid();
        $body = ['event' => 'website_cta_clicked', 'event_id' => $id, 'dimension' => 'nav_downloads'];
        $this->postJson('/web-api/analytics/event', $body)->assertAccepted();
        $this->postJson('/web-api/analytics/event', $body)->assertAccepted();
        $this->postJson('/web-api/analytics/event', [
            'event' => 'website_engagement_interval', 'event_id' => (string) Str::uuid(),
            'dimension' => '/downloads', 'engaged_seconds' => 20,
        ])->assertAccepted();
        $this->assertDatabaseCount('analytics_events', 2);
        $this->postJson('/web-api/analytics/event', [
            'event' => 'website_cta_clicked', 'event_id' => (string) Str::uuid(),
            'dimension' => 'private_path',
        ])->assertStatus(422);
        $this->postJson('/web-api/analytics/event', [
            'event' => 'website_cta_clicked', 'event_id' => (string) Str::uuid(),
            'dimension' => 'nav_downloads', 'prompt_text' => 'private',
        ])->assertStatus(422);
        $this->putJson('/web-api/analytics/consent', ['choice' => 'linked', 'policy_version' => 1])->assertForbidden();
    }

    public function test_desktop_updater_artifact_does_not_inflate_website_downloads(): void
    {
        Storage::fake('analytics-releases');
        Storage::disk('analytics-releases')->put('private/Vibyra.app.tar.gz', 'archive');
        config([
            'releases.disk' => 'analytics-releases',
            'releases.platforms.macos-arm64' => [
                'label' => 'Vibyra for macOS (Apple Silicon)',
                'architecture' => 'arm64', 'minimum_system_version' => '12.0',
                'version' => '1.0.1', 'path' => 'private/Vibyra.dmg',
                'filename' => 'Vibyra.dmg', 'expected_extension' => 'dmg',
                'size_bytes' => 7, 'sha256' => hash('sha256', 'archive'),
                'require_complete_metadata' => true,
                'updater' => [
                    'version' => '1.0.1', 'path' => 'private/Vibyra.app.tar.gz',
                    'filename' => 'Vibyra.app.tar.gz', 'expected_extension' => 'gz',
                    'size_bytes' => 7, 'sha256' => hash('sha256', 'archive'),
                    'signature' => 'test-signed-artifact',
                ],
            ],
        ]);
        $this->get('/downloads/macos-arm64/update')->assertOk();
        $this->assertDatabaseCount('analytics_events', 0);
    }

    public function test_daily_pruning_uses_server_creation_time_and_keeps_recent_events(): void
    {
        config(['owner_analytics.retention_days' => 400]);
        foreach ([401, 399] as $age) {
            DB::table('analytics_events')->insert([
                'event_id' => (string) Str::uuid(), 'surface' => 'website',
                'event' => 'website_page_view', 'dimension' => '/',
                'occurred_at' => now(), 'created_at' => now()->subDays($age),
            ]);
        }
        $this->artisan('vibyra:prune-analytics')->assertExitCode(0);
        $this->assertDatabaseCount('analytics_events', 1);
        $scheduled = collect(app(Schedule::class)->events())->first(
            fn ($event) => str_contains((string) $event->command, 'vibyra:prune-analytics')
        );
        $this->assertNotNull($scheduled);
        $this->assertTrue($scheduled->onOneServer);
        $this->assertTrue($scheduled->withoutOverlapping);
    }

    public function test_page_tracking_requires_explicit_cookie_consent(): void
    {
        $this->get('/')->assertOk();
        $this->withUnencryptedCookie('vibyra_analytics', 'deny')->get('/downloads')->assertOk();
        $this->assertDatabaseCount('analytics_events', 0);

        $this->withUnencryptedCookie('vibyra_analytics', 'allow')->get('/')->assertOk();
        $this->assertDatabaseCount('analytics_events', 1);
        $this->assertNotNull(DB::table('analytics_events')->value('visitor_hash'));
        $this->assertNull(DB::table('analytics_events')->value('user_id'));
    }

    public function test_daily_rollups_require_a_group_of_distinct_visitors_and_store_no_identifiers(): void
    {
        for ($index = 0; $index < 5; $index++) {
            DB::table('analytics_events')->insert([
                'event_id' => (string) Str::uuid(), 'surface' => 'website',
                'event' => 'website_page_view', 'dimension' => '/',
                'visitor_hash' => str_repeat((string) $index, 64),
                'occurred_at' => now('UTC')->subDay(), 'created_at' => now(),
            ]);
        }
        for ($index = 0; $index < 5; $index++) {
            DB::table('analytics_events')->insert([
                'event_id' => (string) Str::uuid(), 'surface' => 'mobile',
                'event' => 'mobile_app_opened',
                'consent_subject_hash' => str_repeat('a', 64),
                'occurred_at' => now('UTC')->subDay(), 'created_at' => now(),
            ]);
        }
        $this->artisan('vibyra:rollup-analytics')->assertExitCode(0);
        $this->assertDatabaseCount('analytics_daily_rollups', 1);
        $this->assertDatabaseHas('analytics_daily_rollups', [
            'surface' => 'website', 'event' => 'website_page_view', 'events_count' => 5,
        ]);
        $this->assertEqualsCanonicalizing(
            ['id', 'day', 'surface', 'event', 'events_count', 'engaged_seconds', 'created_at'],
            \Illuminate\Support\Facades\Schema::getColumnListing('analytics_daily_rollups'),
        );
    }

}
