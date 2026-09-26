<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\VibyraSession;
use App\Services\Analytics\OwnerReport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class AnalyticsConsentTest extends TestCase
{
    use RefreshDatabase;

    public function test_unknown_and_declined_choices_reject_optional_events(): void
    {
        $this->getJson('/api/analytics/consent?surface=mobile')->assertUnauthorized();
        $this->postJson('/api/analytics/events', $this->event())->assertUnauthorized();
        $this->signIn();
        $this->getJson('/api/analytics/consent?surface=mobile')
            ->assertOk()->assertJsonPath('choice', 'unknown');
        $this->postJson('/api/analytics/events', $this->event())
            ->assertForbidden()->assertJsonPath('error', 'analytics_consent_required');
        $this->putJson('/api/analytics/consent', [
            'surface' => 'mobile', 'choice' => 'declined', 'policy_version' => 1,
        ])->assertOk()->assertJsonPath('choice', 'declined');
        $this->postJson('/api/analytics/events', $this->event())->assertForbidden();
        $this->assertDatabaseCount('analytics_events', 0);
    }

    public function test_aggregate_stays_unlinked_and_withdrawal_erases_its_events(): void
    {
        $user = $this->signIn();
        $this->putJson('/api/analytics/consent', [
            'surface' => 'mobile', 'choice' => 'aggregate', 'policy_version' => 1,
        ])->assertOk()->assertJsonPath('choice', 'aggregate');
        $this->postJson('/api/analytics/events', $this->event())->assertStatus(202);
        $stored = DB::table('analytics_events')->first();
        $this->assertNull($stored->user_id);
        $this->assertNotNull($stored->consent_subject_hash);
        $this->assertNull($stored->country_code);
        $this->putJson('/api/analytics/consent', [
            'surface' => 'mobile', 'choice' => 'declined', 'policy_version' => 1,
        ])->assertOk();
        $this->assertDatabaseCount('analytics_events', 0);
        $this->assertDatabaseHas('analytics_consents', [
            'user_id' => $user->id, 'surface' => 'mobile', 'choice' => 'declined',
        ]);
        $this->assertDatabaseCount('analytics_consent_changes', 2);
    }

    public function test_linked_choice_does_not_retroactively_identify_aggregate_events(): void
    {
        $user = $this->signIn();
        $this->putJson('/api/analytics/consent', [
            'surface' => 'mobile', 'choice' => 'aggregate', 'policy_version' => 1,
        ])->assertOk();
        $first = $this->event();
        $this->postJson('/api/analytics/events', $first)->assertStatus(202);
        $this->putJson('/api/analytics/consent', [
            'surface' => 'mobile', 'choice' => 'linked', 'policy_version' => 1,
        ])->assertOk();
        $second = $this->event();
        $second['consent_mode'] = 'linked';
        $this->postJson('/api/analytics/events', $second)->assertStatus(202);
        $this->assertDatabaseHas('analytics_events', ['event_id' => $first['event_id'], 'user_id' => null]);
        $this->assertDatabaseHas('analytics_events', ['event_id' => $second['event_id'], 'user_id' => $user->id]);
        $this->putJson('/api/analytics/consent', [
            'surface' => 'mobile', 'choice' => 'aggregate', 'policy_version' => 1,
        ])->assertOk();
        $this->assertDatabaseCount('analytics_events', 0);
    }

    public function test_duration_is_bounded_and_a_mobile_choice_does_not_authorize_desktop(): void
    {
        $this->signIn();
        $this->putJson('/api/analytics/consent', [
            'surface' => 'mobile', 'choice' => 'aggregate', 'policy_version' => 1,
        ])->assertOk();
        foreach ([0, 61, '30'] as $seconds) {
            $this->postJson('/api/analytics/events', [
                ...$this->event(), 'event' => 'mobile_engagement_interval',
                'properties' => ['seconds' => $seconds],
            ])->assertUnprocessable();
        }
        $this->postJson('/api/analytics/events', [
            ...$this->event(), 'event' => 'mobile_engagement_interval',
            'properties' => ['seconds' => 30],
        ])->assertStatus(202);
        $this->assertDatabaseHas('analytics_events', ['engaged_seconds' => 30, 'user_id' => null]);
        $report = app(OwnerReport::class)->read(7);
        $this->assertSame(30, $report['overview']['mobile']['engaged_seconds']);
        $this->assertSame(1, $report['overview']['mobile']['recent_engaged_sessions_5m']);
        $this->assertSame(1, $report['overview']['mobile']['active_users']);
        $this->postJson('/api/analytics/events', [
            ...$this->event(), 'surface' => 'desktop', 'event' => 'desktop_app_opened',
            'properties' => ['platform' => 'macos'],
        ])->assertForbidden();
    }

    public function test_another_bearer_session_cannot_inherit_consent_and_local_mode_caps_linkage(): void
    {
        $user = $this->signIn();
        $this->putJson('/api/analytics/consent', [
            'surface' => 'mobile', 'choice' => 'linked', 'policy_version' => 1,
        ])->assertOk();
        $aggregateEvent = $this->event();
        $this->postJson('/api/analytics/events', $aggregateEvent)->assertStatus(202);
        $this->assertDatabaseHas('analytics_events', [
            'event_id' => $aggregateEvent['event_id'], 'user_id' => null,
        ]);

        VibyraSession::create([
            'user_id' => $user->id,
            'token_hash' => hash('sha256', 'second-token'),
        ]);
        $this->withToken('second-token')->getJson('/api/analytics/consent?surface=mobile')
            ->assertOk()->assertJsonPath('choice', 'unknown');
        $this->postJson('/api/analytics/events', [
            ...$this->event(), 'consent_mode' => 'linked',
        ])->assertForbidden();

        $this->putJson('/api/analytics/consent', [
            'surface' => 'mobile', 'choice' => 'aggregate', 'policy_version' => 1,
        ])->assertOk();
        $this->postJson('/api/analytics/events', $this->event())->assertAccepted();
        $this->assertDatabaseCount('analytics_events', 2);

        $this->withToken('consent-test-token')->putJson('/api/analytics/consent', [
            'surface' => 'mobile', 'choice' => 'declined', 'policy_version' => 1,
        ])->assertOk();
        $this->assertDatabaseCount('analytics_events', 0);
        $this->getJson('/api/analytics/consent?surface=mobile')->assertJsonPath('choice', 'declined');
        $this->withToken('second-token')->getJson('/api/analytics/consent?surface=mobile')
            ->assertJsonPath('choice', 'declined');
        $this->postJson('/api/analytics/events', $this->event())->assertForbidden();
    }

    public function test_ingestion_can_be_stopped_without_changing_saved_consent(): void
    {
        $this->signIn();
        $this->putJson('/api/analytics/consent', [
            'surface' => 'mobile', 'choice' => 'aggregate', 'policy_version' => 1,
        ])->assertOk();
        config(['owner_analytics.ingestion_enabled' => false]);
        $this->postJson('/api/analytics/events', $this->event())
            ->assertForbidden()->assertJsonPath('error', 'analytics_unavailable');
        $this->assertDatabaseCount('analytics_events', 0);
        $this->getJson('/api/analytics/consent?surface=mobile')
            ->assertOk()->assertJsonPath('choice', 'aggregate');
    }

    private function signIn(): User
    {
        $user = User::factory()->create();
        VibyraSession::create([
            'user_id' => $user->id,
            'token_hash' => hash('sha256', 'consent-test-token'),
        ]);
        $this->withToken('consent-test-token');

        return $user;
    }

    private function event(): array
    {
        return [
            'event_id' => (string) Str::uuid(),
            'surface' => 'mobile',
            'event' => 'mobile_chat_prompt_sent',
            'properties' => ['model' => 'openai/gpt-5', 'effort' => 'high'],
        ];
    }
}
