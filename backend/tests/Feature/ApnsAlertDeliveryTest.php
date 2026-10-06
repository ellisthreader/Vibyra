<?php
namespace Tests\Feature;

use App\Jobs\DeliverPhoneNotification;
use App\Services\Notifications\PhonePush;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http};
use Tests\Support\PhonePushFixture;
use Tests\TestCase;

final class ApnsAlertDeliveryTest extends TestCase
{
    use RefreshDatabase, PhonePushFixture;

    private string $start = 'aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11aa11';
    private string $card = 'bb22bb22bb22bb22bb22bb22bb22bb22bb22bb22bb22bb22bb22bb22bb22bb22';

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootPhonePush();
    }

    /** A Mac terminal starts waiting (one alert-worthy event). */
    private function needsYou(string $key = 't:12', string $title = 'Fix login bug'): void
    {
        $this->mac([], [self::row($key, $title)]);
        $this->mac([self::row($key, $title)]);
    }

    private function delivery(): object
    {
        return DB::table('notification_deliveries')->orderByDesc('id')->first();
    }

    public function test_the_alert_payload_and_headers_are_exact_and_names_only(): void
    {
        $this->fakeApns();
        $device = $this->registerApns('sandbox');
        $this->needsYou();
        $item = $this->item('t:12', 'mac_approval');
        $alerts = $this->alerts();
        $this->assertCount(1, $alerts);
        $r = $alerts[0];
        $this->assertSame('https://api.sandbox.push.apple.com/3/device/'.$this->apnsToken, $r->url());
        $this->assertSame('alert', $r->header('apns-push-type')[0]);
        $this->assertSame('app.vibyra.mobile', $r->header('apns-topic')[0]);
        $this->assertSame('10', $r->header('apns-priority')[0]);
        $this->assertSame('mac:t:12', $r->header('apns-collapse-id')[0]);
        $this->assertGreaterThan(time(), (int) $r->header('apns-expiration')[0]);
        $this->assertStringStartsWith('bearer ', $r->header('authorization')[0]);
        $this->assertSame(['aps' => ['alert' => ['title' => 'Claude needs you', 'body' => 'Fix login bug · Vibyra'], 'sound' => 'default',
            'badge' => 1, 'thread-id' => 'mac:t:12', 'interruption-level' => 'time-sensitive', 'relevance-score' => 1],
            'body' => ['version' => 1, 'notificationId' => $item->id]], $r->data());
        $this->assertSame('accepted', $this->delivery()->state);
        $this->assertSame('sandbox', DB::table('notification_devices')->where('id', $device)->value('apns_host'));
    }

    public function test_a_production_hint_falls_back_to_sandbox_and_remembers_it(): void
    {
        $this->fakeApns([400, 'BadDeviceToken'], [200, null]);
        $device = $this->registerApns('production');
        $this->needsYou();
        $this->assertSame('accepted', $this->delivery()->state);
        $this->assertSame('sandbox', DB::table('notification_devices')->where('id', $device)->value('apns_host'));
        $this->assertNull(DB::table('notification_devices')->where('id', $device)->value('revoked_at'));
    }

    public function test_an_unregistered_token_is_revoked_and_never_used_again(): void
    {
        $this->fakeApns([200, null], [410, 'Unregistered']);
        $device = $this->registerApns('sandbox');
        $this->needsYou();
        $this->assertSame(['failed', 'Unregistered'], [$this->delivery()->state, $this->delivery()->error]);
        $this->assertNotNull(DB::table('notification_devices')->where('id', $device)->value('revoked_at'));
        $sent = count($this->alerts());
        $this->needsYou('t:13');
        $this->assertCount($sent, $this->alerts());
    }

    public function test_a_token_both_hosts_refuse_is_revoked(): void
    {
        $this->fakeApns([400, 'BadDeviceToken'], [400, 'BadDeviceToken']);
        $device = $this->registerApns('sandbox');
        $this->needsYou();
        $this->assertCount(2, $this->alerts());
        $this->assertSame(['failed', 'BadDeviceToken'], [$this->delivery()->state, $this->delivery()->error]);
        $this->assertNotNull(DB::table('notification_devices')->where('id', $device)->value('revoked_at'));
    }

    public function test_throttling_retries_with_backoff_and_keeps_the_device(): void
    {
        $busy = true;
        Http::fake(function () use (&$busy) { return $busy ? Http::response(['reason' => 'TooManyRequests'], 429) : Http::response('', 200); });
        $device = $this->registerApns('sandbox');
        $this->needsYou();
        $d = $this->delivery();
        $this->assertSame(['pending', 1, 'DeliveryUnconfirmed'], [$d->state, $d->attempts, $d->error]);
        $this->assertTrue(now()->lt($d->next_at));
        $this->assertNull(DB::table('notification_devices')->where('id', $device)->value('revoked_at'));
        $busy = false;
        $this->travel(2)->minutes();
        (new DeliverPhoneNotification($d->id))->handle();
        $this->assertSame('accepted', $this->delivery()->state);
    }

    public function test_the_hourly_cap_keeps_overflow_in_the_inbox(): void
    {
        config(['intelligence.alert_rate_per_hour' => 2]);
        $this->fakeApns();
        $this->registerApns('sandbox');
        foreach (['t:1', 't:2', 't:3'] as $key) $this->needsYou($key);
        $this->assertCount(2, $this->alerts());
        $this->assertSame(['suppressed', 'RateLimited'], [$this->delivery()->state, $this->delivery()->error]);
        $this->assertSame(3, DB::table('notification_items')->count());
        // An hour later the cap has room again.
        $this->travel(61)->minutes();
        $this->needsYou('t:4');
        $this->assertCount(3, $this->alerts());
    }

    public function test_each_category_follows_its_own_switch(): void
    {
        $this->fakeApns();
        $this->registerApns('sandbox');
        $prefs = $this->getJson('/api/notifications/v1/preferences', $this->auth)->assertOk()->json('preferences');
        $this->patchJson('/api/notifications/v1/preferences', [...$prefs, 'failures' => false], $this->auth)
            ->assertOk()->assertJsonPath('preferences.failures', false);
        $this->mac([], [self::row('t:1', 'Ship'), self::row('t:2', 'Break')]);
        $this->mac([], [], [['key' => 't:1', 'title' => 'Ship', 'outcome' => 'done'], ['key' => 't:2', 'title' => 'Break', 'outcome' => 'failed']]);
        $alerts = $this->alerts();
        $this->assertCount(1, $alerts);
        $this->assertSame('Claude finished', $alerts[0]['aps']['alert']['title']);
        $this->assertSame(0.5, $alerts[0]['aps']['relevance-score']);
        $failed = $this->item('t:2', 'mac_failed');
        $this->assertSame('suppressed', DB::table('notification_deliveries')->where('item_id', $failed->id)->value('state'));
    }

    public function test_master_off_sends_nothing(): void
    {
        $this->fakeApns();
        $device = $this->registerApns('sandbox');
        $this->deleteJson('/api/notifications/v1/devices/'.$device, [], $this->auth)->assertOk();
        $this->needsYou();
        $this->assertSame([], $this->alerts());
        $this->assertSame(1, DB::table('notification_items')->count());

        // Push switched off on the server: nothing is sent either, and registration is refused.
        config(['intelligence.push' => false]);
        $this->registerApnsExpecting(503);
        $this->needsYou('t:2');
        $this->assertSame([], $this->alerts());
    }

    public function test_quiet_hours_hold_the_alert(): void
    {
        $this->fakeApns();
        $this->registerApns('sandbox');
        $prefs = $this->getJson('/api/notifications/v1/preferences', $this->auth)->json('preferences');
        $minute = now()->hour * 60 + now()->minute;
        $this->patchJson('/api/notifications/v1/preferences', [...$prefs, 'timezone' => 'UTC',
            'quietStart' => $minute, 'quietEnd' => ($minute + 60) % 1440], $this->auth)->assertOk();
        $this->needsYou();
        $this->assertSame([], $this->alerts());
        $this->assertSame('pending', $this->delivery()->state);
        $this->assertTrue(now()->lt($this->delivery()->next_at));
    }

    public function test_the_live_activity_stays_silent_when_this_phone_gets_the_notification(): void
    {
        $this->fakeApns();
        $this->putJson('/api/live-status/v1/phone', ['installId' => 'abc123', 'startToken' => $this->start], $this->auth)->assertOk();
        $this->registerApns('sandbox', 'abc123');
        $this->mac([], [self::row('t:1')]);
        $start = Http::recorded(fn ($r) => str_contains($r->url(), $this->start))->first()[0];
        $this->assertSame('start', $start['aps']['event']);
        $this->assertArrayNotHasKey('sound', $start['aps']['alert']);

        $this->putJson('/api/live-status/v1/phone', ['installId' => 'abc123', 'cardToken' => $this->card], $this->auth)->assertOk();
        $this->mac([self::row('t:1')]);
        $update = Http::recorded(fn ($r) => str_contains($r->url(), $this->card))->last()[0];
        $this->assertSame('needs', $update['aps']['content-state']['phase']);
        $this->assertArrayNotHasKey('alert', $update['aps']);
        $this->assertSame('5', $update->header('apns-priority')[0]);
        $this->assertCount(1, $this->alerts());
    }

    public function test_the_live_activity_still_alerts_for_a_phone_without_notifications(): void
    {
        $this->fakeApns();
        $this->putJson('/api/live-status/v1/phone', ['installId' => 'abc123', 'cardToken' => $this->card], $this->auth)->assertOk();
        $this->registerApns('sandbox', 'other-phone');
        $this->mac([], [self::row('t:1')]);
        $this->mac([self::row('t:1')]);
        $update = Http::recorded(fn ($r) => str_contains($r->url(), $this->card))->last()[0];
        $this->assertSame('Claude needs you', $update['aps']['alert']['title']);
    }

    public function test_security_pushes_use_apns_without_a_badge(): void
    {
        $this->fakeApns();
        $id = $this->registerApns('sandbox');
        $device = DB::table('notification_devices')->find($id);
        $result = app(PhonePush::class)->security($device, 'New sign-in to remote access', 'evt-uuid', (int) $device->generation);
        $this->assertSame('accepted', $result['state']);
        $r = $this->alerts()[0];
        $this->assertSame(['aps' => ['alert' => ['title' => 'New sign-in to remote access', 'body' => 'Open Vibyra to review remote access.'],
            'sound' => 'default', 'thread-id' => 'security', 'interruption-level' => 'active'],
            'body' => ['version' => 1, 'securityEventId' => 'evt-uuid']], $r->data());
    }

    public function test_a_legacy_expo_device_is_not_pushed_without_an_expo_token(): void
    {
        $this->fakeApns();
        config(['intelligence.expo_project' => '00000000-0000-4000-8000-000000000001']);
        $this->postJson('/api/notifications/v1/devices', ['installation' => (string) \Illuminate\Support\Str::uuid(), 'proof' => str_repeat('p', 64),
            'token' => 'ExpoPushToken[legacy]', 'projectId' => '00000000-0000-4000-8000-000000000001', 'environment' => 'development'], $this->auth)->assertOk();
        $this->needsYou();
        Http::assertNothingSent();
        $this->assertSame(['suppressed', 'PushUnavailable'], [$this->delivery()->state, $this->delivery()->error]);
    }

    private function registerApnsExpecting(int $status): void
    {
        $this->postJson('/api/notifications/v1/devices', ['installation' => (string) \Illuminate\Support\Str::uuid(), 'proof' => str_repeat('p', 64),
            'provider' => 'apns', 'token' => $this->apnsToken, 'environment' => 'sandbox'], $this->auth)->assertStatus($status);
    }
}
