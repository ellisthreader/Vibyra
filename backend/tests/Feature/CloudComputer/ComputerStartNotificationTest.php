<?php
namespace Tests\Feature\CloudComputer;

use App\Services\CloudWorkspaces\Lifecycle;
use App\Services\Notifications\Inbox;
use Illuminate\Support\Facades\DB;

/** A wake tells the owner once: "ready" when the computer answers, "couldn't start" when the boot times out. */
class ComputerStartNotificationTest extends ComputerTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['intelligence.inbox' => true]);
    }

    private function item(): ?object
    {
        return DB::table('notification_items')->where('user_id', $this->user->id)->latest('created_at')->first();
    }

    public function test_ready_is_announced_once_and_stops_being_current_when_it_sleeps(): void
    {
        $this->computerReady();
        $item = DB::table('notification_items')->where('user_id', $this->user->id)->sole();
        $this->assertSame(['replies', 'Your cloud computer is ready'], [$item->category, $item->title]);
        $this->assertSame('cloud.ready', json_decode($item->destination, true)['event']);
        $this->assertSame('Tap to open it.', app(Inbox::class)->payload($item)['destination']['detail']['body']);
        $this->assertTrue(app(Inbox::class)->current($item));
        $this->sleepNow();
        $this->assertFalse(app(Inbox::class)->current($item));
    }

    public function test_a_boot_timeout_says_it_could_not_start_once(): void
    {
        $this->createComputer();
        $this->wake()->assertStatus(202);
        app(Lifecycle::class)->reconcile($this->cid);
        $this->assertNull($this->item());
        $this->travel((int) config('cloud_workspaces.boot_timeout_seconds') + 1)->seconds();
        app(Lifecycle::class)->reconcile($this->cid);
        app(Lifecycle::class)->reconcile($this->cid);
        $item = DB::table('notification_items')->where('user_id', $this->user->id)->sole();
        $this->assertSame(['attention', "Your cloud computer couldn't start"], [$item->category, $item->title]);
        $this->assertSame('Open Vibyra to try again.', app(Inbox::class)->payload($item)['destination']['detail']['body']);
        $this->assertTrue(app(Inbox::class)->current($item));
    }

    public function test_runtime_cannot_claim_backend_startup_events(): void
    {
        $token = $this->computerReady();
        foreach (['cloud.ready', 'cloud.failed'] as $type) {
            $this->asRuntime($token, 'post', 'events', ['type' => $type, 'title' => 'Forged'])->assertStatus(422);
        }
        $this->assertSame(1, DB::table('notification_items')->where('user_id', $this->user->id)->count());
    }

    public function test_a_later_boot_or_withdrawn_consent_invalidates_queued_startup_attention(): void
    {
        $this->computerReady(); $item = $this->item(); $generation = (int) $this->row()->generation;
        DB::table('cloud_workspaces')->where('id', $this->cid)->increment('generation');
        $this->assertFalse(app(Inbox::class)->current($item));
        app(\App\Services\CloudWorkspaces\Git\CloudEvents::class)->lifecycle($this->cid, 'cloud.ready', $generation);
        $this->assertSame(1, DB::table('notification_items')->where('user_id', $this->user->id)->count());
        DB::table('cloud_workspaces')->where('id', $this->cid)->update(['generation' => $generation]);
        DB::table('cloud_connect_consents')->where('user_id', $this->user->id)->update(['revoked_at' => now()]);
        $this->assertFalse(app(Inbox::class)->current($item));
    }

    public function test_the_failed_switch_silences_a_failed_start(): void
    {
        app(\App\Services\Notifications\Preferences::class)->get($this->user->id);
        DB::table('notification_preferences')->where('user_id', $this->user->id)->update(['failures' => false]);
        $this->createComputer();
        $this->wake()->assertStatus(202);
        $this->travel((int) config('cloud_workspaces.boot_timeout_seconds') + 1)->seconds();
        app(Lifecycle::class)->reconcile($this->cid);
        $this->assertNull($this->item());
    }
}
