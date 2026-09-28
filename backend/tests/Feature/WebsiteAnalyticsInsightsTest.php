<?php

namespace Tests\Feature;

use App\Services\Analytics\OwnerReport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class WebsiteAnalyticsInsightsTest extends TestCase
{
    use RefreshDatabase;

    private function event(string $event, ?string $dimension, array $extra = []): void
    {
        $this->postJson('/web-api/analytics/event', ['event' => $event,
            'event_id' => (string) Str::uuid(), 'dimension' => $dimension, ...$extra])->assertAccepted();
    }

    public function test_consented_acquisition_and_signup_make_an_ordered_aggregate_funnel(): void
    {
        $this->putJson('/web-api/analytics/consent', ['choice' => 'aggregate', 'policy_version' => 1])->assertOk();
        $this->withHeader('User-Agent', 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Safari/605.1.15')
            ->get('/?utm_source=linkedin&utm_medium=paid_social&utm_campaign=launch')
            ->assertOk();
        $this->event('website_form_started', 'signup');
        $this->event('website_form_submitted', 'signup');
        $this->postJson('/web-api/auth/signup', ['name' => 'Visitor',
            'email' => 'visitor@example.test', 'password' => 'secret123'])->assertCreated();

        $page = DB::table('analytics_events')->where('event', 'website_page_view')->first();
        $this->assertSame('paid', $page->acquisition_channel);
        $this->assertSame('linkedin', $page->source);
        $this->assertSame('launch', $page->campaign);
        $this->assertSame('mobile', $page->device_type);
        $this->assertNull($page->user_id);
        $this->assertDatabaseHas('analytics_events', ['event' => 'website_signup_completed',
            'visitor_hash' => $page->visitor_hash]);
        $report = app(OwnerReport::class)->read(7);
        $this->assertSame(1, $report['overview']['website']['signups']);
        $this->assertSame(1, $report['overview']['website']['consented_signups']);
        $this->assertSame('paid', $report['breakdowns']['website_channels'][0]->label);
        $this->assertSame([], $report['breakdowns']['website_campaigns']);
        $this->assertSame(1, $report['breakdowns']['website_funnels'][0]['completed']);
    }

    public function test_decline_and_withdrawal_keep_operational_totals_without_journeys(): void
    {
        $this->putJson('/web-api/analytics/consent', ['choice' => 'declined', 'policy_version' => 1])->assertOk();
        $this->get('/?utm_source=google')->assertOk();
        $this->postJson('/web-api/auth/signup', ['name' => 'Visitor',
            'email' => 'declined@example.test', 'password' => 'secret123'])->assertCreated();
        $report = app(OwnerReport::class)->read(7);
        $this->assertSame(1, $report['overview']['website']['signups']);
        $this->assertNull($report['overview']['website']['unique_visitors']);
        $this->assertDatabaseMissing('analytics_events', ['event' => 'website_signup_completed']);

        $this->putJson('/web-api/analytics/consent', ['choice' => 'aggregate', 'policy_version' => 1])->assertOk();
        $this->get('/')->assertOk();
        $this->assertDatabaseHas('analytics_events', ['event' => 'website_page_view']);
        $this->putJson('/web-api/analytics/consent', ['choice' => 'declined', 'policy_version' => 1])->assertOk();
        $this->assertDatabaseMissing('analytics_events', ['event' => 'website_page_view']);
        $this->assertDatabaseHas('analytics_events', ['event' => 'website_signup']);
    }

    public function test_performance_and_errors_accept_only_bounded_categories(): void
    {
        $this->putJson('/web-api/analytics/consent', ['choice' => 'aggregate', 'policy_version' => 1])->assertOk();
        $this->event('website_performance', '/', ['metric_name' => 'lcp', 'metric_value' => 1800]);
        $this->event('website_error', '/', ['error_category' => 'script']);
        $this->postJson('/web-api/analytics/event', ['event' => 'website_error',
            'event_id' => (string) Str::uuid(), 'dimension' => '/',
            'error_category' => 'script', 'message' => 'private text'])->assertUnprocessable();
        $this->postJson('/web-api/analytics/event', ['event' => 'website_performance',
            'event_id' => (string) Str::uuid(), 'dimension' => '/',
            'metric_name' => 'lcp', 'metric_value' => 200000])->assertUnprocessable();
        $this->postJson('/web-api/analytics/event', ['event' => 'website_signup_attempted',
            'event_id' => (string) Str::uuid()])->assertUnprocessable();
        $this->assertDatabaseHas('analytics_ingest_counts', ['surface' => 'website',
            'status' => 'rejected', 'count' => 3]);
        $this->assertDatabaseMissing('analytics_events', ['event' => 'website_error',
            'properties' => 'private text']);
    }

    public function test_successful_download_and_new_waitlist_entry_join_only_consented_sessions(): void
    {
        Storage::fake('insight-releases');
        Storage::disk('insight-releases')->put('private/Vibyra.exe', 'binary');
        config(['releases.disk' => 'insight-releases', 'releases.platforms.windows' => [
            'label' => 'Windows', 'version' => '1.0.0', 'path' => 'private/Vibyra.exe',
            'filename' => 'Vibyra.exe', 'size_bytes' => 6, 'sha256' => hash('sha256', 'binary'),
            'expected_extension' => 'exe', 'require_complete_metadata' => true,
        ]]);
        $this->putJson('/web-api/analytics/consent', ['choice' => 'aggregate', 'policy_version' => 1])->assertOk();
        $this->get('/')->assertOk();
        $this->event('website_download_clicked', 'windows');
        $this->get('/downloads/windows')->assertOk();
        $this->event('website_form_submitted', 'waitlist');
        $this->postJson('/web-api/phone-waitlist', ['email' => 'phone@example.test'])->assertOk();
        $this->postJson('/web-api/phone-waitlist', ['email' => 'phone@example.test'])->assertOk();

        $report = app(OwnerReport::class)->read(7);
        $this->assertSame(1, $report['overview']['website']['downloads']);
        $this->assertSame(1, $report['overview']['website']['consented_downloads']);
        $this->assertSame(1, $report['overview']['website']['waitlist_signups']);
        $this->assertSame(1, $report['breakdowns']['website_funnels'][1]['completed']);
        $this->assertSame(1, $report['breakdowns']['website_funnels'][2]['completed']);
    }

    public function test_known_bot_does_not_create_a_consent_session(): void
    {
        $this->putJson('/web-api/analytics/consent', ['choice' => 'aggregate', 'policy_version' => 1])->assertOk();
        $this->withHeader('User-Agent', 'Googlebot/2.1')->get('/')->assertOk();
        $this->assertDatabaseMissing('analytics_events', ['event' => 'website_page_view']);
    }

    public function test_billing_return_pages_are_counted_as_views_not_purchases(): void
    {
        $this->putJson('/web-api/analytics/consent', ['choice' => 'aggregate', 'policy_version' => 1])->assertOk();
        $this->get('/billing/success')->assertOk();
        $this->get('/billing/cancel')->assertOk();
        $this->assertDatabaseHas('analytics_events', ['event' => 'website_page_view',
            'dimension' => '/billing/success']);
        $this->assertDatabaseHas('analytics_events', ['event' => 'website_page_view',
            'dimension' => '/billing/cancel']);
        $this->assertSame(0, app(OwnerReport::class)->read(7)['overview']['website']['verified_purchases']);
    }

    public function test_funnel_requires_a_server_request_before_completion(): void
    {
        $this->putJson('/web-api/analytics/consent', ['choice' => 'aggregate', 'policy_version' => 1])->assertOk();
        $this->get('/')->assertOk();
        $subject = DB::table('analytics_events')->where('event', 'website_page_view')->value('visitor_hash');
        foreach (['website_signup_completed', 'website_signup_attempted'] as $event) {
            DB::table('analytics_events')->insert(['event_id' => (string) Str::uuid(),
                'surface' => 'website', 'event' => $event,
                'visitor_hash' => $subject, 'consent_subject_hash' => $subject,
                'occurred_at' => now(), 'created_at' => now()]);
        }

        $funnel = app(OwnerReport::class)->read(7)['breakdowns']['website_funnels'][0];
        $this->assertSame(1, $funnel['visited']);
        $this->assertSame(1, $funnel['started']);
        $this->assertSame(0, $funnel['completed']);
    }
}
