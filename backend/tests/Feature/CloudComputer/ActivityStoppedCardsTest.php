<?php
namespace Tests\Feature\CloudComputer;

use App\Jobs\SendLiveActivityUpdate;
use App\Services\CloudComputer\Activity\HostEvents;
use App\Services\LiveActivities\Dispatcher;
use App\Services\Notifications\Devices;
use Illuminate\Support\Facades\{DB, Http, Queue};
use Illuminate\Support\Str;

/** A `stopped` conversation ends its Live Activity card quietly and never starts one (flag LIVE_ACTIVITIES_ENABLED). */
class ActivityStoppedCardsTest extends ActivityTestCase
{
    private const TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
    private const START = 'f0e1d2c3b4a5968778695a4b3c2d1e0ff0e1d2c3b4a5968778695a4b3c2d1e0f';
    private string $deviceId;

    private function liveActivities(): void
    {
        $key = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1']);
        openssl_pkey_export($key, $pem);
        config(['live_activities.enabled' => true, 'live_activities.apns.key' => $pem, 'live_activities.apns.key_id' => 'KEY1234567',
            'intelligence.push' => true, 'intelligence.expo_project' => '00000000-0000-4000-8000-000000000001', 'intelligence.environment' => 'development']);
        $this->deviceId = app(Devices::class)->register($this->session, ['installation' => (string) Str::uuid(), 'proof' => str_repeat('p', 64),
            'token' => 'ExpoPushToken[fixture]', 'environment' => 'development', 'projectId' => config('intelligence.expo_project')])['id'];
        $this->putJson('/api/notifications/v1/live-activities/push-to-start', ['deviceId' => $this->deviceId, 'token' => self::START])->assertOk();
    }

    private function sent(): array
    {
        return Http::recorded(fn ($request) => str_contains($request->url(), 'push.apple.com'))->map(fn ($pair) => $pair[0])->values()->all();
    }

    public function test_a_stop_with_no_card_queues_nothing_and_starts_nothing(): void
    {
        $token = $this->liveComputer();
        $this->liveActivities();
        $this->report($token, [$this->ev(self::A, 'stopped')])->assertOk();
        Queue::assertNotPushed(SendLiveActivityUpdate::class);
        app(Dispatcher::class)->deliver(HostEvents::cardId($this->user->id, 'claude', self::A));
        $this->assertSame([], $this->sent(), 'a stopped conversation never starts a card');
    }

    public function test_a_stop_ends_a_showing_card_with_no_alert_and_an_ended_card_is_left_alone(): void
    {
        $token = $this->liveComputer();
        $this->liveActivities();
        $card = HostEvents::cardId($this->user->id, 'claude', self::A);
        $this->report($token, [$this->ev(self::A, 'running', now()->subSeconds(30)->toIso8601String())])->assertOk();
        app(Dispatcher::class)->deliver($card);
        $this->putJson('/api/notifications/v1/live-activities/runs/'.$card.'/token', ['deviceId' => $this->deviceId, 'agentId' => '00000000-0000-0000-0000-000000000000', 'token' => self::TOKEN])->assertOk();
        app(Dispatcher::class)->deliver($card);
        $before = count($this->sent());
        $this->report($token, [$this->ev(self::A, 'stopped', now()->subSeconds(5)->toIso8601String())])->assertOk();
        Queue::assertPushed(SendLiveActivityUpdate::class, fn ($job) => $job->runId === $card);
        app(Dispatcher::class)->deliver($card);
        app(Dispatcher::class)->deliver($card);
        $after = array_slice($this->sent(), $before);
        $this->assertCount(1, $after, 'one end, never repeated');
        $aps = json_decode($after[0]->body(), true)['aps'];
        $this->assertSame('end', $aps['event']);
        $this->assertArrayNotHasKey('alert', $aps);
        $this->assertLessThan($aps['timestamp'], $aps['dismissal-date']);
        $this->assertNotNull(DB::table('live_activity_tokens')->where('run_id', $card)->value('ended_at'));
    }
}
