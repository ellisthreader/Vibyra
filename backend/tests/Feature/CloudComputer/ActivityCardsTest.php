<?php
namespace Tests\Feature\CloudComputer;

use App\Jobs\SendLiveActivityUpdate;
use App\Services\CloudComputer\Activity\HostEvents;
use App\Services\LiveActivities\Dispatcher;
use App\Services\Notifications\Devices;
use Illuminate\Support\Facades\{DB, Http, Queue};
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;

/** `running` and the attention phases as a Live Activity content state with source `cloud_host` (flag LIVE_ACTIVITIES_ENABLED). */
class ActivityCardsTest extends ActivityTestCase
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

    private function card(string $id): string
    {
        return HostEvents::cardId($this->user->id, 'claude', $id);
    }

    public function test_off_by_default_nothing_is_queued(): void
    {
        $token = $this->liveComputer();
        $this->report($token, [$this->ev(self::A, 'running'), $this->ev(self::A, 'waiting')])->assertOk();
        Queue::assertNotPushed(SendLiveActivityUpdate::class);
    }

    public function test_a_conversation_starts_updates_and_ends_a_card_without_private_text(): void
    {
        $token = $this->liveComputer();
        $this->liveActivities();
        $card = $this->card(self::A);
        $this->report($token, [$this->ev(self::A, 'running', now()->subSeconds(20)->toIso8601String())])->assertOk();
        Queue::assertPushed(SendLiveActivityUpdate::class, fn ($job) => $job->runId === $card);
        app(Dispatcher::class)->deliver($card);
        $start = json_decode($this->sent()[0]->body(), true)['aps'];
        $this->assertSame(['start', 'VibyraRunAttributes', 'cloud_host', 'working'], [$start['event'], $start['attributes-type'], $start['content-state']['source'], $start['content-state']['phase']]);
        $this->assertSame([$card, 'Vibyra Cloud'], [$start['attributes']['runId'], $start['attributes']['name']]);
        // The phone started the card and registers its token; an unknown card id is refused.
        $this->putJson('/api/notifications/v1/live-activities/runs/'.$card.'/token', ['deviceId' => $this->deviceId, 'agentId' => '00000000-0000-0000-0000-000000000000', 'token' => self::TOKEN])->assertOk();
        $this->putJson('/api/notifications/v1/live-activities/runs/'.Str::uuid().'/token', ['deviceId' => $this->deviceId, 'agentId' => '00000000-0000-0000-0000-000000000000', 'token' => self::TOKEN])->assertStatus(404);
        app(Dispatcher::class)->deliver($card); // what the registration queues: the card catches up to `working`
        $this->report($token, [$this->ev(self::A, 'waiting')])->assertOk();
        app(Dispatcher::class)->deliver($card);
        $this->report($token, [$this->ev(self::A, 'finished', now()->addSecond()->toIso8601String())])->assertOk();
        app(Dispatcher::class)->deliver($card);
        app(Dispatcher::class)->deliver($card);
        $bodies = array_map(fn ($r) => json_decode($r->body(), true)['aps'], array_slice($this->sent(), 1));
        $this->assertSame(['update', 'update', 'end'], array_column($bodies, 'event'), 'each change once, an ended card never again');
        $this->assertSame(['working', 'needs_approval', 'finished'], array_map(fn ($b) => $b['content-state']['phase'], $bodies));
        $all = implode(' ', array_map(fn ($r) => $r->body(), $this->sent()));
        foreach (['Fix the login bug', 'my-app', self::A] as $private) $this->assertStringNotContainsString($private, $all);
        $this->assertNotNull(DB::table('live_activity_tokens')->where('run_id', $card)->value('ended_at'));
    }

    public function test_the_project_name_rides_along_only_with_details_on(): void
    {
        $token = $this->liveComputer();
        $this->liveActivities();
        DB::table('live_activity_preferences')->insert(['user_id' => $this->user->id, 'enabled' => true, 'details' => true, 'revision' => 1, 'created_at' => now(), 'updated_at' => now()]);
        $this->report($token, [$this->ev(self::A, 'running')])->assertOk();
        app(Dispatcher::class)->deliver($this->card(self::A));
        $this->assertSame('my-app', json_decode($this->sent()[0]->body(), true)['aps']['content-state']['project']);
    }

    public static function withdrawals(): array { return [['agreement'], ['project'], ['generation']]; }

    #[DataProvider('withdrawals')]
    public function test_a_queued_card_cannot_start_or_update_after_access_changes(string $kind): void
    {
        $token = $this->liveComputer(); $this->liveActivities(); $card = $this->card(self::A);
        $this->report($token, [$this->ev(self::A, 'running')])->assertOk();
        $this->putJson('/api/notifications/v1/live-activities/runs/'.$card.'/token', ['deviceId' => $this->deviceId,
            'agentId' => '00000000-0000-0000-0000-000000000000', 'token' => self::TOKEN])->assertOk();
        Queue::assertPushed(SendLiveActivityUpdate::class, fn ($job) => $job->runId === $card);
        match ($kind) {
            'agreement' => DB::table('cloud_connect_consents')->where('user_id', $this->user->id)->update(['revoked_at' => now()]),
            'project' => DB::table('cloud_project_access')->where('user_id', $this->user->id)->where('name', 'my-app')->update(['allowed' => false]),
            'generation' => DB::table('cloud_workspaces')->where('id', $this->cid)->increment('generation'),
        };
        app(Dispatcher::class)->deliver($card);
        $this->assertSame([], $this->sent());
    }
}
