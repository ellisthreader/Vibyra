<?php

namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use App\Services\Remote\{RemoteAccessException, RemoteSecurityFailures};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class RemoteSecurityFailuresTest extends TestCase
{
    use RefreshDatabase;

    private function accountSession(User $user, string $name): VibyraSession
    {
        return VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', $name), 'device_name' => $name,
            'idle_expires_at' => now()->addDay(), 'absolute_expires_at' => now()->addDay()]);
    }

    public function test_failures_add_short_increasing_delays_without_locking_another_session(): void
    {
        $user = User::factory()->create(); $app = $this->accountSession($user, 'first');
        $other = $this->accountSession($user, 'second'); $failures = app(RemoteSecurityFailures::class);
        for ($i = 0; $i < 3; $i++) $failures->failure($app, 'device', '192.0.2.1');
        try { $failures->check($app, 'device', '192.0.2.1'); $this->fail('Backoff missing'); }
        catch (RemoteAccessException $e) { $this->assertSame(429, $e->status); }
        $failures->check($other, 'device', '192.0.2.1');
        $this->travel(2)->seconds(); $failures->check($app, 'device', '192.0.2.1');
        $failures->failure($app, 'device', '192.0.2.1');
        $this->travel(3)->seconds();
        try { $failures->check($app, 'device', '192.0.2.1'); $this->fail('Delay did not increase'); }
        catch (RemoteAccessException $e) { $this->assertSame(429, $e->status); }
        $this->travel(61)->seconds(); $failures->check($app, 'device', '192.0.2.1');
        $this->assertDatabaseCount('security_events', 0);
    }

    public function test_ten_account_failures_raise_one_metadata_only_alert_without_country_blocking(): void
    {
        $app = $this->accountSession(User::factory()->create(), 'first');
        $failures = app(RemoteSecurityFailures::class);
        for ($i = 0; $i < 12; $i++) $failures->failure($app, 'device-'.$i, '192.0.2.'.$i);
        $this->assertSame(1, DB::table('security_events')->where('event_type', 'REMOTE_ACCESS_FAILURES')->count());
        $event = DB::table('security_events')->first();
        $this->assertSame(['count' => 10], json_decode($event->metadata, true));
        $failures->check($app, 'device-new', '198.51.100.1');
        $this->travel(61)->seconds();
        $failures->failure($app, 'device', '192.0.2.1');
        $this->assertSame(1, DB::table('security_events')->where('event_type', 'REMOTE_ACCESS_FAILURES')->count());
    }
}
