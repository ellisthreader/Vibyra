<?php
namespace Tests\Feature;

use App\Services\Notifications\Devices;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Crypt, DB};
use Illuminate\Support\Str;
use Tests\Support\PhonePushFixture;
use Tests\TestCase;

final class NotificationDevicesApnsTest extends TestCase
{
    use RefreshDatabase, PhonePushFixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootPhonePush();
        config(['intelligence.expo_project' => '00000000-0000-4000-8000-000000000001']);
    }

    private function body(array $over = []): array
    {
        return ['installation' => (string) Str::uuid(), 'proof' => str_repeat('p', 64), 'provider' => 'apns',
            'token' => $this->apnsToken, 'environment' => 'sandbox', 'liveInstallId' => 'abc123', ...$over];
    }

    public function test_an_apns_token_registers_and_preferences_report_it(): void
    {
        $id = $this->postJson('/api/notifications/v1/devices', $this->body(['token' => strtoupper($this->apnsToken)]), $this->auth)
            ->assertOk()->assertJsonPath('version', 1)->json('id');
        $row = DB::table('notification_devices')->find($id);
        $this->assertSame(['apns', 'sandbox', 'abc123', null], [$row->provider, $row->environment, $row->live_install_id, $row->apns_host]);
        $this->assertSame($this->apnsToken, Crypt::decryptString($row->token));
        $this->assertTrue(app(Devices::class)->eligible($row));
        $this->getJson('/api/notifications/v1/preferences', $this->auth)->assertOk()
            ->assertJsonPath('deviceId', $id)->assertJsonPath('capabilities.apns', true)->assertJsonPath('capabilities.push', true)
            ->assertJsonPath('preferences.failures', true)->assertJsonPath('preferences.attention', true);
    }

    public function test_registration_is_validated(): void
    {
        foreach ([['token' => 'not-hex-at-all'], ['token' => str_repeat('a', 63)], ['token' => str_repeat('a', 201)],
            ['environment' => 'development'], ['proof' => 'short'], ['liveInstallId' => '../etc'], ['provider' => 'fcm']] as $bad) {
            $this->postJson('/api/notifications/v1/devices', $this->body($bad), $this->auth)->assertStatus(422);
        }
        $this->postJson('/api/notifications/v1/devices', $this->body(['liveInstallId' => null]))->assertStatus(401);
        $this->assertSame(0, DB::table('notification_devices')->count());
    }

    public function test_unavailable_until_push_and_the_apns_key_are_configured(): void
    {
        config(['intelligence.push' => false]);
        $this->postJson('/api/notifications/v1/devices', $this->body(), $this->auth)->assertStatus(503);
        $this->getJson('/api/notifications/v1/preferences', $this->auth)->assertJsonPath('capabilities.apns', false);
        config(['intelligence.push' => true, 'live_status.apns.key' => null, 'live_status.apns.key_path' => null]);
        $this->postJson('/api/notifications/v1/devices', $this->body(), $this->auth)->assertStatus(503);
        $this->getJson('/api/notifications/v1/preferences', $this->auth)->assertJsonPath('capabilities.apns', false);
    }

    public function test_the_expo_shape_is_still_accepted(): void
    {
        $id = $this->postJson('/api/notifications/v1/devices', ['installation' => (string) Str::uuid(), 'proof' => str_repeat('p', 64),
            'token' => 'ExpoPushToken[abc]', 'projectId' => config('intelligence.expo_project'), 'environment' => 'development'], $this->auth)
            ->assertOk()->json('id');
        $this->assertSame('expo', DB::table('notification_devices')->where('id', $id)->value('provider'));
    }

    public function test_an_installation_moves_from_expo_to_apns_on_the_same_row(): void
    {
        $installation = (string) Str::uuid();
        $id = $this->postJson('/api/notifications/v1/devices', ['installation' => $installation, 'proof' => str_repeat('p', 64),
            'token' => 'ExpoPushToken[abc]', 'projectId' => config('intelligence.expo_project'), 'environment' => 'development'], $this->auth)->json('id');
        DB::table('notification_devices')->where('id', $id)->update(['revoked_at' => now()]);
        $again = $this->postJson('/api/notifications/v1/devices', $this->body(['installation' => $installation]), $this->auth)->assertOk()->json('id');
        $row = DB::table('notification_devices')->find($id);
        $this->assertSame($id, $again);
        $this->assertSame(['apns', null, 2], [$row->provider, $row->revoked_at, (int) $row->generation]);
        // A different proof for the same installation is refused.
        $this->postJson('/api/notifications/v1/devices', $this->body(['installation' => $installation, 'proof' => str_repeat('q', 64)]), $this->auth)->assertStatus(409);
    }

    public function test_legacy_expo_devices_can_be_retired_before_push_is_switched_on(): void
    {
        $this->postJson('/api/notifications/v1/devices', ['installation' => (string) Str::uuid(), 'proof' => str_repeat('p', 64),
            'token' => 'ExpoPushToken[abc]', 'projectId' => config('intelligence.expo_project'), 'environment' => 'development'], $this->auth)->assertOk();
        $apns = $this->postJson('/api/notifications/v1/devices', $this->body(), $this->auth)->json('id');
        $this->artisan('vibyra:notifications-retire-expo', ['--dry-run' => true])->expectsOutputToContain('expo 1')->assertSuccessful();
        $this->assertSame(2, DB::table('notification_devices')->whereNull('revoked_at')->count());
        $this->artisan('vibyra:notifications-retire-expo')->expectsOutputToContain('Retired 1')->assertSuccessful();
        $this->artisan('vibyra:notifications-retire-expo')->expectsOutputToContain('Retired 0')->assertSuccessful();
        $this->assertSame([$apns], DB::table('notification_devices')->whereNull('revoked_at')->pluck('id')->all());
    }

    public function test_the_failed_switch_saves_with_the_revision_check(): void
    {
        $prefs = $this->getJson('/api/notifications/v1/preferences', $this->auth)->json('preferences');
        $this->patchJson('/api/notifications/v1/preferences', [...$prefs, 'failures' => false], $this->auth)
            ->assertOk()->assertJsonPath('preferences.failures', false)->assertJsonPath('preferences.revision', $prefs['revision'] + 1);
        $this->patchJson('/api/notifications/v1/preferences', [...$prefs, 'failures' => true], $this->auth)->assertStatus(409);
    }
}
