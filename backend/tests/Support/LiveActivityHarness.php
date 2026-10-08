<?php
namespace Tests\Support;

use App\Models\AgentV2\Run;
use App\Models\VibyraSession;
use App\Services\AgentRuns\Lifecycle;
use App\Services\Notifications\Devices;
use Illuminate\Support\Facades\{Cache, DB, Http, Queue};
use Illuminate\Support\Str;

/** Shared setup for the Live Activity feature tests: a fake APNs, a registered phone and run helpers. */
trait LiveActivityHarness
{
    use AgentV2Fixture;

    protected const TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
    protected const START = 'f0e1d2c3b4a5968778695a4b3c2d1e0ff0e1d2c3b4a5968778695a4b3c2d1e0f';
    protected string $deviceId;
    /** What the fake APNs answers next: [status, body]. */
    protected array $apns = [200, ''];

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(now()->startOfSecond());
        $this->bootV2();
        $key = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1']);
        openssl_pkey_export($key, $pem);
        config(['live_activities.enabled' => true, 'live_activities.apns.key' => $pem, 'live_activities.apns.key_id' => 'KEY1234567',
            'intelligence.push' => true, 'intelligence.inbox' => true, 'intelligence.expo_project' => '00000000-0000-4000-8000-000000000001',
            'intelligence.environment' => 'development']);
        Http::fake(['api.sandbox.push.apple.com/*' => fn () => Http::response($this->apns[1], $this->apns[0])]);
        Queue::fake();
        Cache::flush();
        $this->deviceId = $this->device();
    }

    protected function device(): string
    {
        $session = VibyraSession::create(['user_id' => $this->user->id, 'token_hash' => hash('sha256', 'phone-session'),
            'idle_expires_at' => now()->addDay(), 'absolute_expires_at' => now()->addDays(2)]);
        return app(Devices::class)->register($session, ['installation' => (string) Str::uuid(), 'proof' => str_repeat('p', 64),
            'token' => 'ExpoPushToken[fixture]', 'environment' => 'development', 'projectId' => config('intelligence.expo_project')])['id'];
    }

    protected function phone(): static
    {
        return $this->withToken('phone-session');
    }

    protected function register(string $runId, ?string $token = null)
    {
        return $this->phone()->putJson('/api/notifications/v1/live-activities/runs/'.$runId.'/token',
            ['deviceId' => $this->deviceId, 'agentId' => $this->agent['id'], 'token' => $token ?? self::TOKEN]);
    }

    protected function move(string $runId, string $to): void
    {
        app(Lifecycle::class)->move(Run::query()->findOrFail($runId), $to);
    }

    protected function sentApns(): array
    {
        return Http::recorded(fn ($request) => str_contains($request->url(), 'push.apple.com'))->map(fn ($pair) => $pair[0])->values()->all();
    }

    protected function runInState(string $state = 'running'): string
    {
        $run = $this->admit('Please email my SECRET plan to alice@example.com');
        $claimed = $this->claim();
        $this->assertSame($run['id'], $claimed['id']);
        $this->move($claimed['id'], 'running');
        if ($state !== 'running') $this->move($claimed['id'], $state);
        return $run['id'];
    }

    protected function generationOf(string $run): int
    {
        return (int) DB::table('agent_runs')->where('id', $run)->value('lease_generation');
    }
}
