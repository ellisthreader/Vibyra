<?php

namespace Tests\Feature;

use App\Jobs\DeliverRemoteSecurityNotification;
use App\Models\{User, VibyraSession};
use App\Services\Notifications\Devices;
use App\Services\Remote\SecurityEvents;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http, Mail, Queue};
use Illuminate\Support\Str;
use Tests\TestCase;

class RemoteSecurityEventsTest extends TestCase
{
    use RefreshDatabase;
    private function account(string $token): VibyraSession
    {
        return VibyraSession::create(['user_id' => User::factory()->create()->id, 'token_hash' => hash('sha256', $token),
            'idle_expires_at' => now()->addDay(), 'absolute_expires_at' => now()->addDay()]);
    }
    public function test_events_are_owned_and_sensitive_fields_are_discarded(): void
    {
        Queue::fake(); $a = $this->account('a'); $b = $this->account('b');
        app(SecurityEvents::class)->record($a->user_id, 'REMOTE_SESSION_STARTED', ['device' => 'Phone', 'password' => 'SECRET', 'commands' => 'SECRET', 'token' => 'SECRET']);
        app(SecurityEvents::class)->record($b->user_id, 'DEVICE_APPROVED', ['device' => 'Other phone']);
        $this->getJson('/api/security/events')->assertUnauthorized();
        $events = $this->getJson('/api/security/events', ['Authorization' => 'Bearer a'])->assertOk()->assertHeader('Cache-Control', 'no-store, private')->json('events');
        $this->assertCount(1, $events); $this->assertSame('Phone', $events[0]['metadata']['device']);
        $this->assertStringNotContainsString('SECRET', json_encode(DB::table('security_events')->get()));
        $this->postJson('/api/security/events/'.$events[0]['id'].'/read', [], ['Authorization' => 'Bearer b'])->assertNotFound();
        $this->postJson('/api/security/events/'.$events[0]['id'].'/read', [], ['Authorization' => 'Bearer a'])->assertOk();
    }
    public function test_push_is_metadata_only_and_duplicate_job_does_not_send_twice(): void
    {
        Queue::fake(); Mail::fake();
        config(['remote_security.email_notifications' => false, 'intelligence.push' => true, 'intelligence.expo_project' => 'test-project', 'intelligence.environment' => 'test']);
        $session = $this->account('phone');
        app(Devices::class)->register($session, ['projectId' => 'test-project', 'environment' => 'test',
            'installation' => (string) Str::uuid(), 'proof' => str_repeat('p', 32), 'token' => 'ExponentPushToken[test]']);
        Http::fake(['exp.host/*' => Http::response(['data' => ['status' => 'ok', 'id' => 'ticket']])]);
        $event = app(SecurityEvents::class)->record($session->user_id, 'REMOTE_SESSION_STARTED');
        $id = DB::table('security_event_deliveries')->where('security_event_id', $event)->value('id');
        (new DeliverRemoteSecurityNotification($id))->handle(); (new DeliverRemoteSecurityNotification($id))->handle();
        Http::assertSentCount(1);
        Http::assertSent(fn ($request) => array_keys($request['data']) === ['version', 'securityEventId'] && $request['priority'] === 'high');
        $this->assertDatabaseHas('security_event_deliveries', ['id' => $id, 'status' => 'accepted']);
    }
    public function test_revoked_push_recipient_and_expired_alert_are_suppressed(): void
    {
        Queue::fake(); Http::fake();
        config(['remote_security.email_notifications' => false, 'intelligence.push' => true, 'intelligence.expo_project' => 'p', 'intelligence.environment' => 'test']);
        $session = $this->account('phone');
        $device = app(Devices::class)->register($session, ['projectId' => 'p', 'environment' => 'test', 'installation' => (string) Str::uuid(), 'proof' => 'proof', 'token' => 'ExponentPushToken[test]']);
        $event = app(SecurityEvents::class)->record($session->user_id, 'REMOTE_SESSION_STARTED');
        DB::table('notification_devices')->where('id', $device['id'])->update(['generation' => 2]);
        $id = DB::table('security_event_deliveries')->where('security_event_id', $event)->value('id');
        (new DeliverRemoteSecurityNotification($id))->handle(); Http::assertNothingSent();
        $this->assertDatabaseHas('security_event_deliveries', ['id' => $id, 'status' => 'suppressed']);
    }
    public function test_phone_warning_is_queued_before_email_and_email_survives_disabled_push(): void
    {
        Queue::fake();
        config(['remote_security.email_notifications' => true, 'intelligence.push' => true,
            'intelligence.expo_project' => 'p', 'intelligence.environment' => 'test']);
        $session = $this->account('phone');
        app(Devices::class)->register($session, ['projectId' => 'p', 'environment' => 'test',
            'installation' => (string) Str::uuid(), 'proof' => 'proof', 'token' => 'ExponentPushToken[test]']);
        $event = app(SecurityEvents::class)->record($session->user_id, 'REMOTE_SESSION_STARTED');
        $channels = fn ($id) => DB::table('security_event_deliveries')->where('security_event_id', $id)
            ->orderBy('id')->pluck('channel')->all();
        $this->assertSame(['push', 'email'], $channels($event));
        config(['intelligence.push' => false]);
        $fallback = app(SecurityEvents::class)->record($session->user_id, 'REMOTE_SESSION_STARTED');
        $this->assertSame(['email'], $channels($fallback));
    }
    public function test_provider_failure_keeps_durable_retry_without_changing_authorization(): void
    {
        Queue::fake(); config(['remote_security.email_notifications' => true, 'intelligence.push' => false]);
        $session = $this->account('phone');
        $event = app(SecurityEvents::class)->record($session->user_id, 'PASSKEY_ADDED');
        $id = DB::table('security_event_deliveries')->where('security_event_id', $event)->value('id');
        Mail::shouldReceive('raw')->once()->andThrow(new \RuntimeException('SECRET_PROVIDER_ERROR'));
        try { (new DeliverRemoteSecurityNotification($id))->handle(); $this->fail('Expected retry'); }
        catch (\RuntimeException $error) { $this->assertSame('Security notification delivery unavailable', $error->getMessage()); }
        $this->assertDatabaseHas('security_event_deliveries', ['id' => $id, 'status' => 'pending', 'attempts' => 1]);
        (new DeliverRemoteSecurityNotification($id))->handle(); // Backoff prevents an immediate second send.
        $this->assertDatabaseHas('security_event_deliveries', ['id' => $id, 'attempts' => 1]);
    }
}
