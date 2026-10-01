<?php
namespace Tests\Feature\CloudComputer;

use App\Services\CloudWorkspaces\Retention;
use Illuminate\Support\Facades\DB;

class ComputerRetentionTest extends ComputerTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['cloud_workspaces.computer_stopped_days' => 30, 'intelligence.inbox' => true]);
    }

    private function phone(): void
    {
        DB::table('notification_devices')->insert(['id' => (string) \Illuminate\Support\Str::uuid(), 'user_id' => $this->user->id, 'session_id' => $this->session->id,
            'installation' => (string) \Illuminate\Support\Str::uuid(), 'proof_hash' => str_repeat('a', 64), 'token' => 'x', 'token_hash' => hash('sha256', 'tok'),
            'generation' => 1, 'environment' => 'test', 'created_at' => now(), 'updated_at' => now()]);
    }

    private function stopped(bool $phone = true): string
    {
        if ($phone) $this->phone();
        $token = $this->computerReady();
        $this->registerHost($token)->assertOk();
        $this->sleepNow();
        $this->assertSame('stopped', $this->row()->state);
        DB::table('cloud_workspaces')->where('id', $this->cid)->update(['volume_id' => 'vol']);
        return $token;
    }
    private function reconcile(): void { app(Retention::class)->reconcile($this->row()); }

    public function test_a_computer_stopped_long_enough_loses_its_volume_but_keeps_its_row_and_host_stays_revoked(): void
    {
        $this->stopped();
        $this->travel(29)->days(); $this->reconcile();
        $this->assertNotContains('destroy', $this->provider->calls);
        $this->assertNull($this->row()->retention_deleted_at);
        // Due now, but the warning went out only 2 days ago: still kept.
        $this->travel(2)->days(); $this->reconcile();
        $this->assertNotContains('destroy', $this->provider->calls);
        $this->assertNull($this->row()->retention_deleted_at);
        $this->travel(2)->days(); $this->reconcile();
        $this->assertContains('destroy', $this->provider->calls);
        $row = $this->row();
        $this->assertNotNull($row->retention_deleted_at);
        $this->assertNull($row->volume_id);
        $this->assertSame('stopped', $row->state);
        $this->assertNotNull(DB::table('remote_hosts')->where('id', $row->remote_host_id)->value('revoked_at'));
        DB::table('vibyra_sessions')->update(['idle_expires_at' => now()->addDay(), 'absolute_expires_at' => now()->addDays(2)]);
        $s = $this->getJson('/api/cloud-computer')->assertOk()->json('computer');
        $this->assertSame('stopped', $s['state']);
        $this->assertNotNull($s['removedAt']);
        $this->assertNull($s['hostId']);
        DB::table('membership_periods')->update(['ends_at' => now()->addYear()]);
        // Setting up again is a normal wake and clears the marker.
        $this->wake()->assertStatus(202);
        $this->assertNull($this->row()->retention_deleted_at);
        $this->assertNull($this->getJson('/api/cloud-computer')->json('computer.removedAt'));
    }

    public function test_boundary_day_exact(): void
    {
        $this->stopped();
        $stoppedAt = \Illuminate\Support\Carbon::parse($this->row()->updated_at);
        $this->travelTo($stoppedAt->copy()->addDays(27)); $this->reconcile();
        $this->assertNotNull($this->row()->retention_warned_at);
        $this->travelTo($stoppedAt->copy()->addDays(30)->subSecond()); $this->reconcile();
        $this->assertNull($this->row()->retention_deleted_at);
        $this->travelTo($stoppedAt->copy()->addDays(30)); $this->reconcile();
        $this->assertNotNull($this->row()->retention_deleted_at);
    }

    public function test_the_minimum_is_seven_days(): void
    {
        config(['cloud_workspaces.computer_stopped_days' => 1]);
        $this->stopped();
        $this->travel(4)->days(); $this->reconcile();
        $this->assertNotNull($this->row()->retention_warned_at);
        $this->travel(2)->days(); $this->reconcile();
        $this->assertNull($this->row()->retention_deleted_at);
        $this->travel(4)->days(); $this->reconcile();
        $this->assertNotNull($this->row()->retention_deleted_at);
    }

    public function test_a_running_or_starting_computer_is_never_deleted(): void
    {
        $this->computerReady();
        $this->travel(90)->days();
        $this->reconcile();
        $this->assertNotContains('destroy', $this->provider->calls);
        $this->assertNull($this->row()->retention_deleted_at);
        $this->assertSame('ready', $this->row()->state);
    }

    public function test_a_computer_that_never_started_has_nothing_to_delete(): void
    {
        $this->createComputer();
        $this->travel(90)->days(); $this->reconcile();
        $this->assertNotContains('destroy', $this->provider->calls);
        $this->assertNull($this->row()->retention_deleted_at);
    }

    public function test_provider_failure_keeps_the_row_retryable(): void
    {
        $this->stopped();
        $failing = new class($this->provider) implements \App\Services\CloudWorkspaces\CloudWorkspaceProvider {
            public bool $fail = true;
            public function __construct(private object $inner) {}
            public function configure(object $w): array { return $this->inner->configure($w); }
            public function recover(object $w): ?array { return null; }
            public function inspect(object $w): string { return 'stopped'; }
            public function stop(object $w): void {}
            public function destroy(object $w): void { if ($this->fail) throw new \RuntimeException('fly down'); $this->inner->destroy($w); }
        };
        $this->app->instance(\App\Services\CloudWorkspaces\CloudWorkspaceProvider::class, $failing);
        $this->travel(28)->days(); $this->reconcile();
        $this->assertNotNull($this->row()->retention_warned_at);
        $this->travel(4)->days();
        try { $this->reconcile(); $this->fail('expected failure'); } catch (\RuntimeException $e) { $this->assertSame('fly down', $e->getMessage()); }
        $row = $this->row();
        $this->assertNull($row->retention_deleted_at);
        $this->assertSame('vol', $row->volume_id);
        $this->assertNull(DB::table('remote_hosts')->where('id', $row->remote_host_id)->value('revoked_at'));
        $failing->fail = false;
        $this->reconcile();
        $this->assertNotNull($this->row()->retention_deleted_at);
    }

    public function test_warning_goes_out_once_three_days_before_removal(): void
    {
        $this->stopped();
        $this->travel(26)->days(); $this->reconcile();
        $this->assertSame(0, DB::table('notification_items')->count());
        $this->travel(2)->days(); $this->reconcile();
        $item = DB::table('notification_items')->where('user_id', $this->user->id)->sole();
        $this->assertSame('Your cloud computer will be removed soon', $item->title);
        $d = json_decode($item->destination, true);
        $this->assertSame('cloud_computer', $d['kind']);
        $this->assertSame($this->cid, $d['workspaceId']);
        $this->reconcile(); $this->travel(1)->hours(); $this->reconcile();
        $this->assertSame(1, DB::table('notification_items')->count());
        $this->assertNotNull($this->row()->retention_warned_at);
        $this->assertNull($this->row()->retention_deleted_at);
    }

    private function assertKeptForever(string $label): void
    {
        $this->travel(60)->days();
        for ($i = 0; $i < 3; $i++) { $this->reconcile(); $this->travel(1)->days(); }
        $this->assertNotContains('destroy', $this->provider->calls, $label);
        $row = $this->row();
        $this->assertNull($row->retention_warned_at, $label);
        $this->assertNull($row->retention_deleted_at, $label);
        $this->assertSame('vol', $row->volume_id, $label);
    }

    public function test_nothing_is_removed_when_the_owner_has_no_phone_to_warn(): void
    {
        $this->stopped(false);
        $this->assertKeptForever('no phone');
    }

    public function test_nothing_is_removed_when_notifications_are_disabled(): void
    {
        $this->stopped();
        config(['intelligence.inbox' => false]);
        $this->assertKeptForever('inbox off');
    }

    public function test_a_throttled_warning_does_not_count_and_a_later_delivery_starts_the_three_days(): void
    {
        $this->stopped();
        $this->travel(40)->days();
        \Illuminate\Support\Facades\Cache::put('cloud-git:event:'.$this->cid.':retention.warning', 1, 86400);
        $this->reconcile();
        $this->assertNull($this->row()->retention_warned_at);
        $this->assertNull($this->row()->retention_deleted_at);
        \Illuminate\Support\Facades\Cache::forget('cloud-git:event:'.$this->cid.':retention.warning');
        $this->reconcile();
        $this->assertNotNull($this->row()->retention_warned_at);
        $this->assertNull($this->row()->retention_deleted_at);
        $this->travel(3)->days(); $this->travel(1)->seconds(); $this->reconcile();
        $this->assertNotNull($this->row()->retention_deleted_at);
    }

    public function test_the_undelivered_log_is_written_once_a_day(): void
    {
        $this->stopped(false);
        $lines = [];
        \Illuminate\Support\Facades\Log::listen(function ($m) use (&$lines) { $lines[] = $m->message; });
        $this->travel(40)->days();
        $this->reconcile(); $this->reconcile(); $this->reconcile();
        $this->assertCount(1, array_filter($lines, fn ($l) => $l === 'cloud.computer.retention_blocked'));
    }
}
