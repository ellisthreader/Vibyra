<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\VibyraSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class OwnerAnalyticsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['owner_analytics.emails' => ['owner@example.test']]);
    }

    public function test_hidden_page_and_report_require_the_verified_configured_web_owner(): void
    {
        $this->get('/owner/login')->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertHeader('X-Robots-Tag', 'noindex, nofollow');
        $this->get('/owner')->assertRedirect('/login');
        $this->getJson('/web-api/owner/analytics')->assertUnauthorized();

        $this->actingAs(User::factory()->create(['email' => 'member@example.test']))
            ->get('/owner')->assertForbidden();
        $this->getJson('/web-api/owner/analytics')->assertForbidden();

        $unverified = User::factory()->create([
            'email' => 'owner@example.test', 'email_verified_at' => null,
        ]);
        $this->actingAs($unverified)->get('/owner')->assertForbidden();

        $unverified->forceFill(['email_verified_at' => now()])->save();
        $this->actingAs($unverified)->get('/owner')->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertHeader('X-Robots-Tag', 'noindex, nofollow');
        $this->getJson('/web-api/owner/analytics?days=30')
            ->assertOk()->assertJsonPath('range.days', 30)
            ->assertJsonPath('overview.website.page_views', null)
            ->assertJsonPath('overview.desktop.active_users', null)
            ->assertJsonPath('overview.mobile.active_users', null)
            ->assertJsonPath('data_quality.tracking_started_at', null);
        $this->getJson('/web-api/owner/analytics?days=365')->assertUnprocessable();
        $this->getJson('/web-api/owner/analytics?days=30junk')->assertUnprocessable();
    }

    public function test_client_events_are_authenticated_deduplicated_and_reject_private_payloads(): void
    {
        $user = User::factory()->create();
        $id = (string) Str::uuid();
        $event = [
            'event_id' => $id,
            'surface' => 'mobile',
            'event' => 'mobile_chat_prompt_sent',
            'properties' => ['model' => 'openai/gpt-5', 'effort' => 'high'],
        ];

        $this->postJson('/api/analytics/events', $event)->assertUnauthorized();
        VibyraSession::create([
            'user_id' => $user->id,
            'token_hash' => hash('sha256', 'test-token'),
            'device_name' => 'iPhone',
        ]);
        $this->withToken('test-token')->postJson('/api/analytics/events', $event)
            ->assertForbidden()->assertJsonPath('error', 'analytics_consent_required');
        $this->putJson('/api/analytics/consent', [
            'surface' => 'mobile', 'choice' => 'aggregate', 'policy_version' => 1,
        ])->assertOk();
        $this->withToken('test-token')->postJson('/api/analytics/events', $event)
            ->assertStatus(202)->assertJsonPath('accepted', true);
        $this->postJson('/api/analytics/events', $event)->assertStatus(202);
        $this->assertDatabaseCount('analytics_events', 1);
        $this->assertDatabaseHas('analytics_events', [
            'event_id' => $id, 'user_id' => null,
            'event' => 'mobile_chat_prompt_sent', 'dimension' => 'openai/gpt-5',
        ]);

        $this->postJson('/api/analytics/events', [
            ...$event, 'event_id' => (string) Str::uuid(),
            'properties' => ['prompt' => 'secret user text'],
        ])->assertUnprocessable();
        $this->postJson('/api/analytics/events', [
            ...$event, 'event_id' => (string) Str::uuid(),
            'surface' => 'desktop',
        ])->assertUnprocessable();
        foreach (['https://example.com', '/Users/ellis/private', 'openai/../secret', 'model\\secret'] as $unsafe) {
            $this->postJson('/api/analytics/events', [
                ...$event, 'event_id' => (string) Str::uuid(),
                'properties' => ['model' => $unsafe],
            ])->assertUnprocessable();
        }
        $this->assertDatabaseCount('analytics_events', 1);
    }

    public function test_owner_bearer_token_cannot_replace_the_browser_session(): void
    {
        $owner = User::factory()->create(['email' => 'owner@example.test']);
        VibyraSession::create([
            'user_id' => $owner->id, 'token_hash' => hash('sha256', 'owner-token'),
        ]);
        $this->withToken('owner-token')->getJson('/web-api/owner/analytics')->assertUnauthorized();
    }

    public function test_owner_report_keeps_website_and_app_metrics_separate(): void
    {
        $owner = User::factory()->create(['email' => 'owner@example.test']);
        VibyraSession::create([
            'user_id' => $owner->id,
            'token_hash' => hash('sha256', 'owner-token'),
            'device_name' => 'Mac',
        ]);
        $this->putJson('/web-api/analytics/consent', ['choice' => 'aggregate', 'policy_version' => 1])->assertOk();
        $this->get('/')->assertOk();
        $this->get('/downloads')->assertOk();
        $this->postJson('/web-api/analytics/event', [
            'event_id' => (string) Str::uuid(), 'event' => 'website_cta_clicked',
            'dimension' => 'nav_downloads',
        ])->assertAccepted();
        $this->postJson('/web-api/analytics/event', [
            'event_id' => (string) Str::uuid(), 'event' => 'website_engagement_interval',
            'dimension' => '/', 'engaged_seconds' => 10,
        ])->assertAccepted();
        foreach (['desktop', 'mobile'] as $surface) {
            $this->withToken('owner-token')->putJson('/api/analytics/consent', [
                'surface' => $surface, 'choice' => 'aggregate', 'policy_version' => 1,
            ])->assertOk();
        }
        $this->withToken('owner-token')->postJson('/api/analytics/events', [
            'event_id' => (string) Str::uuid(), 'surface' => 'desktop',
            'event' => 'desktop_prompt_submitted',
            'properties' => ['provider' => 'codex', 'model' => 'gpt-5'],
        ])->assertStatus(202);
        $this->postJson('/api/analytics/events', [
            'event_id' => (string) Str::uuid(), 'surface' => 'mobile',
            'event' => 'mobile_app_opened', 'properties' => ['platform' => 'ios'],
        ])->assertStatus(202);
        $this->postJson('/api/analytics/events', [
            'event_id' => (string) Str::uuid(), 'surface' => 'mobile',
            'event' => 'mobile_chat_prompt_sent',
            'properties' => ['model' => 'openai/gpt-5', 'effort' => 'high'],
        ])->assertStatus(202);
        $this->postJson('/api/analytics/events', [
            'event_id' => (string) Str::uuid(), 'surface' => 'desktop',
            'event' => 'desktop_app_opened', 'properties' => ['platform' => 'macos', 'app_version' => '0.8.10'],
        ])->assertStatus(202);
        $this->postJson('/api/analytics/events', [
            'event_id' => (string) Str::uuid(), 'surface' => 'desktop',
            'event' => 'desktop_terminal_started', 'properties' => ['provider' => 'codex', 'model' => 'gpt-5'],
        ])->assertStatus(202);
        $this->postJson('/api/analytics/events', [
            'event_id' => (string) Str::uuid(), 'surface' => 'desktop',
            'event' => 'desktop_project_created', 'properties' => ['project_kind' => 'website'],
        ])->assertStatus(202);
        $this->postJson('/api/analytics/events', [
            'event_id' => (string) Str::uuid(), 'surface' => 'mobile',
            'event' => 'mobile_screen_viewed', 'properties' => ['screen' => 'chat'],
        ])->assertStatus(202);
        $this->postJson('/api/analytics/events', [
            'event_id' => (string) Str::uuid(), 'surface' => 'mobile',
            'event' => 'mobile_project_prompt_sent',
            'properties' => ['provider' => 'codex', 'session_type' => 'conversation'],
        ])->assertStatus(202);

        $this->actingAs($owner)->getJson('/web-api/owner/analytics?days=7')
            ->assertOk()
            ->assertJsonPath('overview.website.page_views', 2)
            ->assertJsonPath('overview.website.cta_clicks', 1)
            ->assertJsonPath('overview.website.engaged_seconds', 10)
            ->assertJsonPath('overview.website.recent_engaged_sessions_5m', 1)
            ->assertJsonPath('overview.desktop.prompts_submitted', 1)
            ->assertJsonPath('overview.desktop.active_users', 1)
            ->assertJsonPath('overview.mobile.app_opens', 1)
            ->assertJsonPath('overview.mobile.chat_prompts', 1)
            ->assertJsonPath('overview.mobile.project_prompts', 1)
            ->assertJsonPath('breakdowns.models.0.model', 'gpt-5')
            ->assertJsonPath('breakdowns.website_pages.0.count', 1)
            ->assertJsonPath('breakdowns.desktop_platforms.0.platform', 'macos')
            ->assertJsonPath('breakdowns.desktop_providers.0.provider', 'codex')
            ->assertJsonPath('breakdowns.desktop_prompt_providers.0.provider', 'codex')
            ->assertJsonPath('breakdowns.desktop_project_kinds.0.project_kind', 'website')
            ->assertJsonPath('breakdowns.mobile_platforms.0.platform', 'ios')
            ->assertJsonPath('breakdowns.mobile_screens.0.screen', 'chat')
            ->assertJsonPath('breakdowns.mobile_chat_efforts.0.effort', 'high')
            ->assertJsonPath('breakdowns.mobile_project_providers.0.provider', 'codex')
            ->assertJsonCount(1, 'series.website');
    }
}
