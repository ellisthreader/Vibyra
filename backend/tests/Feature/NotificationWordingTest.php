<?php

namespace Tests\Feature;

use App\Jobs\DeliverRemoteSecurityNotification;
use App\Models\{RemoteHost, RemoteSession, User, VibyraSession};
use App\Services\Notifications\{Devices, Inbox, Preferences};
use App\Services\Remote\SecurityEvents;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http, Queue};
use Illuminate\Support\Str;
use Tests\TestCase;

/** Lock-screen wording: remote access names the phone and the computer, chats say what they need, failures have their own switch. */
class NotificationWordingTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        Queue::fake();
        config(['remote_security.email_notifications' => false, 'intelligence.push' => true, 'intelligence.inbox' => true,
            'intelligence.expo_project' => 'test-project', 'intelligence.environment' => 'test']);
        $this->user = User::factory()->create();
    }

    /** @return array{0:VibyraSession,1:string} app session and notification device id */
    private function phone(string $token): array
    {
        $session = VibyraSession::create(['user_id' => $this->user->id, 'token_hash' => hash('sha256', $token),
            'idle_expires_at' => now()->addDay(), 'absolute_expires_at' => now()->addDay()]);
        $device = app(Devices::class)->register($session, ['projectId' => 'test-project', 'environment' => 'test',
            'installation' => (string) Str::uuid(), 'proof' => str_repeat('p', 32), 'token' => 'ExponentPushToken['.$token.']'])['id'];
        return [$session, $device];
    }

    private function remote(VibyraSession $app, string $status): RemoteSession
    {
        $host = RemoteHost::firstOrCreate(['host_id' => str_repeat('a', 64)], ['user_id' => $this->user->id, 'name' => 'MacBook Pro',
            'remote_access_mode' => 'ask', 'authorization_generation' => 1, 'registered_at' => now()]);
        return RemoteSession::create(['user_id' => $this->user->id, 'remote_host_id' => $host->id, 'app_session_id' => $app->id,
            'grant_id' => Str::lower(Str::random(32)), 'client_name' => 'iPhone 15', 'status' => $status,
            'issued_at' => now(), 'expires_at' => now()->addHour()]);
    }

    private function recipients(int $event): array
    {
        return DB::table('security_event_deliveries')->where('security_event_id', $event)->where('channel', 'push')->pluck('recipient')->all();
    }

    public function test_remote_access_start_names_phone_and_computer_and_skips_the_phone_that_connected(): void
    {
        [$connecting, $connectingDevice] = $this->phone('a');
        [, $otherDevice] = $this->phone('b');
        $session = $this->remote($connecting, 'CONNECTED');
        $event = app(SecurityEvents::class)->record($this->user->id, 'REMOTE_SESSION_STARTED',
            ['client' => 'iPhone 15', 'computer' => 'MacBook Pro'], $session->remote_host_id, null, $session->id);
        $this->assertSame([$otherDevice], $this->recipients($event));
        $this->assertNotContains($connectingDevice, $this->recipients($event));
        Http::fake(['exp.host/*' => Http::response(['data' => ['status' => 'ok', 'id' => 'ticket']])]);
        (new DeliverRemoteSecurityNotification(DB::table('security_event_deliveries')->where('security_event_id', $event)->value('id')))->handle();
        Http::assertSent(fn ($r) => $r['title'] === 'Remote access started' && $r['body'] === 'iPhone 15 is connected to MacBook Pro.'
            && $r['sound'] === 'default');
    }

    public function test_a_request_is_pushed_only_while_it_waits_for_the_computer(): void
    {
        [$asking] = $this->phone('a');
        [, $otherDevice] = $this->phone('b');
        $waiting = $this->remote($asking, 'WAITING_FOR_APPROVAL');
        $event = app(SecurityEvents::class)->record($this->user->id, 'REMOTE_SESSION_REQUESTED',
            ['client' => 'iPhone 15', 'computer' => 'MacBook Pro'], $waiting->remote_host_id, null, $waiting->id);
        $this->assertSame([$otherDevice], $this->recipients($event));
        $trusted = $this->remote($asking, 'AUTHORIZED');
        $silent = app(SecurityEvents::class)->record($this->user->id, 'REMOTE_SESSION_REQUESTED',
            ['client' => 'iPhone 15', 'computer' => 'MacBook Pro'], $trusted->remote_host_id, null, $trusted->id);
        $this->assertSame([], $this->recipients($silent));
        $this->assertSame(['title' => 'iPhone 15 wants to connect', 'body' => 'Allow or deny it on MacBook Pro.'],
            app(SecurityEvents::class)->message('REMOTE_SESSION_REQUESTED', ['client' => 'iPhone 15', 'computer' => 'MacBook Pro']));
    }

    public function test_remote_access_end_reaches_every_phone_quietly(): void
    {
        [$connected] = $this->phone('a');
        $this->phone('b');
        $session = $this->remote($connected, 'ENDED');
        $event = app(SecurityEvents::class)->record($this->user->id, 'REMOTE_SESSION_ENDED',
            ['client' => 'iPhone 15', 'computer' => 'MacBook Pro'], $session->remote_host_id, null, $session->id);
        $this->assertCount(2, $this->recipients($event));
        Http::fake(['exp.host/*' => Http::response(['data' => ['status' => 'ok', 'id' => 'ticket']])]);
        (new DeliverRemoteSecurityNotification(DB::table('security_event_deliveries')->where('security_event_id', $event)->value('id')))->handle();
        Http::assertSent(fn ($r) => $r['title'] === 'Remote access ended' && $r['body'] === 'iPhone 15 disconnected from MacBook Pro.'
            && !isset($r['sound']));
        $this->assertSame(['title' => 'Remote access ended', 'body' => 'A device disconnected from your computer.'],
            app(SecurityEvents::class)->message('REMOTE_SESSION_ENDED'));
    }

    public function test_a_chat_on_a_computer_says_what_it_needs_and_where(): void
    {
        app(Preferences::class)->get($this->user->id);
        $this->travel(1)->seconds();
        RemoteHost::create(['user_id' => $this->user->id, 'host_id' => str_repeat('c', 64), 'name' => 'MacBook Pro',
            'remote_access_mode' => 'ask', 'authorization_generation' => 1, 'registered_at' => now()]);
        $titles = [];
        foreach (['approval_pending', 'question_pending', 'failed'] as $i => $phase) {
            foreach ([str_repeat('c', 64), str_repeat('d', 64)] as $j => $host) {
                $id = DB::table('work_events')->insertGetId(['user_id' => $this->user->id, 'source' => 'host_conversation', 'run_id' => "r$i$j",
                    'fingerprint' => hash('sha256', "f$i$j"), 'phase' => $phase, 'created_at' => now(),
                    'metadata' => json_encode(['phase' => $phase, 'hostId' => $host, 'sessionId' => 's'])]);
                app(Inbox::class)->publish($id);
                $titles[] = DB::table('notification_items')->where('event_id', $id)->value('title');
            }
        }
        $this->assertSame(['A chat on MacBook Pro needs your approval', 'A chat on your computer needs your approval',
            'A chat on MacBook Pro has a question', 'A chat on your computer has a question',
            'A chat on MacBook Pro stopped with an error', 'A chat on your computer stopped with an error'], $titles);
        $item = fn (string $category, array $destination = []) => (object) ['category' => $category, 'destination' => json_encode($destination)];
        $this->assertSame('Open Vibyra to see the result.', app(Inbox::class)->body($item('replies')));
        $this->assertSame('Open Vibyra to review.', app(Inbox::class)->body($item('attention')));
        $this->assertSame('Tap to open it.', app(Inbox::class)->body($item('replies', ['event' => 'cloud.ready'])));
        $this->assertSame('Open Vibyra to try again.', app(Inbox::class)->body($item('attention', ['event' => 'cloud.failed'])));
    }

    public function test_failed_has_its_own_switch_on_by_default(): void
    {
        [$session] = $this->phone('a');
        $headers = ['Authorization' => 'Bearer a'];
        $prefs = $this->getJson('/api/notifications/v1/preferences', $headers)->assertOk()->json('preferences');
        $this->assertTrue($prefs['failures']);
        $saved = $this->patchJson('/api/notifications/v1/preferences', ['revision' => $prefs['revision'], 'failures' => false,
            'quietStart' => null, 'quietEnd' => null], $headers)->assertOk()->json('preferences');
        $this->assertFalse($saved['failures']);
        $this->assertTrue($saved['attention']);
        $this->patchJson('/api/notifications/v1/preferences', ['revision' => $saved['revision'], 'failures' => 'maybe',
            'quietStart' => null, 'quietEnd' => null], $headers)->assertUnprocessable();
        $p = app(Preferences::class)->get($session->user_id);
        $this->assertFalse(app(Preferences::class)->allows($p, 'attention', 'agent_failed'));
        $this->assertFalse(app(Preferences::class)->allows($p, 'attention', 'cloud_failed'));
        $this->assertTrue(app(Preferences::class)->allows($p, 'attention', 'agent_approval'));
    }
}
