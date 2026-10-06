<?php

namespace Tests\Support;

use App\Models\{User, VibyraSession};
use Illuminate\Support\Facades\{DB, Http};
use Illuminate\Support\Str;

/** Shared setup for iPhone notification tests: APNs key, an account, an APNs device, Mac snapshots. */
trait PhonePushFixture
{
    protected string $apnsToken = 'cc33cc33cc33cc33cc33cc33cc33cc33cc33cc33cc33cc33cc33cc33cc33cc33';
    protected int $userId;
    protected array $auth;

    protected function bootPhonePush(): void
    {
        $key = openssl_pkey_new(self::openSslOptions(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]));
        openssl_pkey_export($key, $pem);
        config(['app.key' => 'base64:'.base64_encode(str_repeat('n', 32)),
            'live_status.enabled' => true, 'live_status.apns.key' => $pem, 'live_status.apns.key_id' => 'TESTKEY123',
            'intelligence.inbox' => true, 'intelligence.push' => true, 'intelligence.mac_events' => true,
            'intelligence.expo_token' => null, 'intelligence.environment' => 'development']);
        $this->travelTo(now()->startOfSecond());
        Http::preventStrayRequests();
        $user = User::factory()->create();
        $this->userId = $user->id;
        $plain = 'phone-push-'.$user->id;
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', $plain),
            'idle_expires_at' => now()->addDays(5), 'absolute_expires_at' => now()->addDays(10)]);
        $this->auth = ['Authorization' => "Bearer $plain"];
    }

    protected function fakeApns(array $production = [200, null], array $sandbox = [200, null]): void
    {
        $answer = fn (array $a) => Http::response($a[1] ? ['reason' => $a[1]] : '', $a[0]);
        Http::fake(['api.sandbox.push.apple.com/*' => $answer($sandbox), 'api.push.apple.com/*' => $answer($production)]);
    }

    protected function registerApns(string $environment = 'sandbox', ?string $liveInstallId = null, ?string $token = null): string
    {
        return $this->postJson('/api/notifications/v1/devices', ['installation' => (string) Str::uuid(), 'proof' => str_repeat('p', 64),
            'provider' => 'apns', 'token' => $token ?? $this->apnsToken, 'environment' => $environment, 'liveInstallId' => $liveInstallId], $this->auth)
            ->assertOk()->json('id');
    }

    protected function mac(array $attention = [], array $working = [], array $recent = [])
    {
        return $this->postJson('/api/live-status/v1/mac', ['name' => 'Studio Mac', 'attention' => $attention, 'working' => $working, 'recent' => $recent], $this->auth)->assertOk();
    }

    protected static function row(string $key, string $title = 'Fix login bug', string $project = 'Vibyra', string $agent = 'claude'): array
    {
        return ['key' => $key, 'title' => $title, 'project' => $project, 'agent' => $agent];
    }

    /** APNs alert requests (not Live Activity pushes) recorded so far. */
    protected function alerts(): array
    {
        return Http::recorded(fn ($request) => ($request->header('apns-push-type')[0] ?? null) === 'alert')
            ->map(fn ($pair) => $pair[0])->values()->all();
    }

    protected function item(string $key, string $phase): object
    {
        $event = DB::table('work_events')->where('source', 'mac')->where('run_id', 'mac:'.$key)->where('phase', $phase)->orderByDesc('id')->value('id');
        return DB::table('notification_items')->where('event_id', $event)->firstOrFail();
    }
}
