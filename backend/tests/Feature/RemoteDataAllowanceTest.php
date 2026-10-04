<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\VibyraSession;
use App\Services\Remote\RemoteDataAllowance;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RemoteDataAllowanceTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'relay-test-secret-that-is-long-enough-0123456789';

    protected function setUp(): void
    {
        parent::setUp();
        config(['remote.relay_url' => 'wss://relay.vibyra.test', 'remote.relay_secret' => self::SECRET,
            'remote.relay_report_secret' => self::SECRET, 'vibes.remote_access_live' => true, 'remote.monthly_data_gb' => 1]);
    }

    private function report(array $bytes)
    {
        return $this->postJson('/api/remote/relay/events', ['relayId' => 'relay-1', 'events' => [['event' => 'usage', 'bytes' => $bytes]]],
            ['Authorization' => 'Bearer '.self::SECRET]);
    }

    public function test_usage_adds_up_per_month_and_the_relay_is_told_who_to_slow_down(): void
    {
        $gb = 1024 ** 3;
        $this->report(['7' => (int) (0.6 * $gb), '8' => 1000])->assertOk()->assertJsonPath('slowed', []);
        $this->report(['7' => (int) (0.5 * $gb)])->assertOk()->assertJsonPath('slowed', ['7']);
        $this->assertSame((int) (0.6 * $gb) + (int) (0.5 * $gb), app(RemoteDataAllowance::class)->forUser(7)['usedBytes']);
        $this->assertTrue(app(RemoteDataAllowance::class)->forUser(7)['slowed']);
        $this->assertFalse(app(RemoteDataAllowance::class)->forUser(8)['slowed']);

        $this->travelTo(now()->startOfMonth()->addMonth()->addHour());
        $this->report(['8' => 1])->assertOk()->assertJsonPath('slowed', []);
        $this->assertSame(0, app(RemoteDataAllowance::class)->forUser(7)['usedBytes'], 'a new month starts from zero');
    }

    public function test_malformed_counts_are_ignored_and_reports_need_the_relay_secret(): void
    {
        $this->report(['abc' => 5, '9' => -4, '10' => 'many', '11' => 11 * 1024 ** 3, '12' => 2.5])->assertOk();
        $this->assertSame(0, \Illuminate\Support\Facades\DB::table('remote_data_usage')->count());
        $this->postJson('/api/remote/relay/events', ['events' => [['event' => 'usage', 'bytes' => ['7' => 5]]]],
            ['Authorization' => 'Bearer wrong-secret-that-is-long-enough-000000000'])->assertStatus(401);
    }

    public function test_the_phone_sees_its_remote_data_this_month(): void
    {
        $user = User::factory()->create(['email_verified_at' => now()]);
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', 'remote-data'), 'device_name' => 'iPhone']);
        $this->report([(string) $user->id => 2048])->assertOk();
        $this->withToken('remote-data')->getJson('/api/remote/hosts')->assertOk()
            ->assertJsonPath('data.usedBytes', 2048)->assertJsonPath('data.allowanceBytes', 1024 ** 3)->assertJsonPath('data.slowed', false);
    }
}
