<?php
namespace Tests\Feature\CloudGit;

use App\Jobs\DeliverPhoneNotification;
use App\Models\VibyraSession;
use App\Services\Notifications\{Devices, Inbox};
use Illuminate\Support\Facades\{DB, Queue};
use Illuminate\Support\Str;

class GitEventsTest extends CloudGitTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['intelligence.inbox' => true, 'intelligence.push' => true, 'intelligence.expo_project' => '00000000-0000-4000-8000-000000000001']);
        $s = VibyraSession::create(['user_id' => $this->user->id, 'token_hash' => hash('sha256', 'phone-session'),
            'idle_expires_at' => now()->addDay(), 'absolute_expires_at' => now()->addDays(2)]);
        app(Devices::class)->register($s, ['installation' => (string) Str::uuid(), 'proof' => str_repeat('p', 64),
            'token' => 'ExpoPushToken[fixture]', 'environment' => 'development', 'projectId' => config('intelligence.expo_project')]);
    }
    private function event(string $type = 'task.finished', array $over = [], ?string $token = null)
    {
        return $this->asRuntime($token)->postJson('/api/cloud-runtime/'.$this->workspace.'/events', ['type' => $type, 'title' => 'Tests passed', 'body' => 'api: 12 green', ...$over]);
    }
    public function test_task_finished_writes_an_item_and_queues_one_delivery_with_generic_lock_screen_copy(): void
    {
        $this->event()->assertStatus(202)->assertJson(['sent' => true]);
        $item = DB::table('notification_items')->where('user_id', $this->user->id)->sole();
        $this->assertSame('Your cloud computer finished', $item->title);
        $this->assertSame('replies', $item->category);
        $this->assertSame('Tests passed', json_decode($item->destination, true)['detail']['title']);
        $this->assertDatabaseHas('notification_deliveries', ['item_id' => $item->id, 'state' => 'pending']);
        Queue::assertPushed(DeliverPhoneNotification::class, 1);
        $this->assertTrue(app(Inbox::class)->current($item));
    }
    public function test_destination_names_the_cloud_computer_host_and_optional_session(): void
    {
        $hostId = bin2hex(random_bytes(32));
        $rh = DB::table('remote_hosts')->insertGetId(['user_id' => $this->user->id, 'host_id' => $hostId, 'name' => 'Cloud', 'platform' => 'linux', 'registered_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        DB::table('cloud_workspaces')->where('id', $this->workspace)->update(['remote_host_id' => $rh]);
        $this->event('approval.needed', ['sessionId' => 'sess-1'])->assertStatus(202)->assertJson(['sent' => true]);
        $d = json_decode(DB::table('notification_items')->value('destination'), true);
        $this->assertSame('cloud_computer', $d['kind']);
        $this->assertSame('cloud_computer', $d['source']);
        $this->assertSame($this->workspace, $d['workspaceId']);
        $this->assertSame($hostId, $d['hostId']);
        $this->assertSame('sess-1', $d['sessionId']);
        $this->assertSame('approval.needed', $d['event']);
        $this->assertSame('Your cloud computer needs approval', DB::table('notification_items')->value('title'));
        // No session, and a revoked host row carries no key.
        DB::table('remote_hosts')->where('id', $rh)->update(['revoked_at' => now()]);
        $this->event('login.needed')->assertJson(['sent' => true]);
        $this->assertArrayNotHasKey('sessionId', json_decode(DB::table('notification_items')->where('title', 'Your cloud computer needs you to sign in')->value('destination'), true));
        $this->assertNull(json_decode(DB::table('notification_items')->where('title', 'Your cloud computer needs you to sign in')->value('destination'), true)['hostId']);
        $this->event('approval.needed', ['sessionId' => 'bad id!'])->assertStatus(422);
    }
    public function test_the_vm_cannot_send_the_backend_only_retention_warning(): void
    {
        $this->event('retention.warning')->assertStatus(422);
        $this->assertSame(0, DB::table('notification_items')->count());
    }
    public function test_repeats_are_throttled_per_workspace_and_type_only(): void
    {
        $this->event('approval.needed')->assertJson(['sent' => true]);
        $this->event('approval.needed')->assertJson(['sent' => false, 'reason' => 'throttled']);
        $this->event('login.needed')->assertJson(['sent' => true]);
        $this->assertSame(2, DB::table('notification_items')->count());
        $this->travel(31)->seconds();
        $this->event('approval.needed')->assertJson(['sent' => true]);
    }
    public function test_preferences_are_respected(): void
    {
        app(\App\Services\Notifications\Preferences::class)->get($this->user->id);
        DB::table('notification_preferences')->where('user_id', $this->user->id)->update(['replies' => false]);
        $this->event('task.finished')->assertJson(['sent' => false, 'reason' => 'preference_off']);
        $this->event('approval.needed')->assertJson(['sent' => true]);
        $this->assertSame(1, DB::table('notification_items')->count());
        DB::table('notification_preferences')->where('user_id', $this->user->id)->update(['attention' => false]);
        $this->travel(2)->minutes();
        $this->event('approval.needed')->assertJson(['sent' => false, 'reason' => 'preference_off']);
    }
    public function test_content_is_clipped_and_inbox_disabled_sends_nothing(): void
    {
        $this->event('task.finished', ['title' => str_repeat('t', 500), 'body' => str_repeat('b', 2000)])->assertStatus(202);
        $d = json_decode(DB::table('notification_items')->value('destination'), true)['detail'];
        $this->assertSame(80, strlen($d['title']));
        $this->assertSame(240, strlen($d['body']));
        config(['intelligence.inbox' => false]);
        $this->event('login.needed')->assertJson(['sent' => false, 'reason' => 'disabled']);
        $this->assertSame(1, DB::table('notification_items')->count());
    }
    public function test_validation_and_runtime_auth(): void
    {
        $this->event('nope')->assertStatus(422);
        $this->event('task.finished', ['title' => ''])->assertStatus(422);
        $this->event('task.finished', [], 'wrong')->assertStatus(401);
        $this->event('task.finished', [], 'cloud-test')->assertStatus(401);
        $this->assertSame(0, DB::table('notification_items')->count());
    }
}
