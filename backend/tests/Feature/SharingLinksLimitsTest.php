<?php

namespace Tests\Feature;

use App\Models\{AccountAuditEvent, User};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Support\{SharingFixture, SharingLinkHelpers};
use Tests\TestCase;

/** Part 17: the cap on live links, rate limits, and a deleted account taking its links with it. */
class SharingLinksLimitsTest extends TestCase
{
    use RefreshDatabase, SharingFixture, SharingLinkHelpers;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootLinks();
    }

    public function test_an_account_can_hold_twenty_live_links_and_revoking_or_expiry_frees_a_slot(): void
    {
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        $this->travelTo(now()->startOfSecond());
        $ids = [];
        for ($i = 0; $i < 20; $i++) {
            [$r] = $this->share([], ['days' => $i === 0 ? 1 : 7]);
            $ids[] = $r->assertCreated()->json('link.id');
        }
        $hash = $this->preview()->json('preview.snapshotHash');
        $this->assertSame([20, 20], [$this->preview()->json('preview.active'), $this->preview()->json('preview.limit')]);
        $full = fn () => $this->postJson('/api/sharing/links', [...$this->source(), 'snapshotHash' => $hash, 'confirm' => true]);
        $full()->assertStatus(409)->assertJsonPath('code', 'share_limit');
        $this->deleteJson('/api/sharing/links/'.$ids[5])->assertOk();
        $full()->assertCreated();
        $full()->assertStatus(409);
        $this->travel(25)->hours();
        $full()->assertCreated();
        $other = $this->signedIn('other-session');
        $this->finishedRun($mine = $this->teammate('Mine', [], $other), 'Hi', 'Hello', 'completed', $other);
        $this->assertSame(0, $this->preview(['agentId' => $mine['id']])->json('preview.active'), 'The cap is per account.');
    }

    public function test_creating_and_viewing_are_rate_limited(): void
    {
        config(['sharing.link_max_active' => 100]);
        $hash = $this->preview()->json('preview.snapshotHash');
        for ($i = 0; $i < 10; $i++) $this->postJson('/api/sharing/links', [...$this->source(), 'snapshotHash' => $hash, 'confirm' => true])->assertCreated();
        $this->postJson('/api/sharing/links', [...$this->source(), 'snapshotHash' => $hash, 'confirm' => true])->assertStatus(429);
        for ($i = 0; $i < 60; $i++) $this->page('x'.$i)->assertNotFound();
        $this->page('one-more')->assertStatus(429);
    }

    public function test_previews_are_rate_limited(): void
    {
        for ($i = 0; $i < 20; $i++) $this->preview()->assertOk();
        $this->preview()->assertStatus(429);
    }

    public function test_deleting_the_account_deletes_its_links(): void
    {
        [, $token] = $this->share();
        [, $second] = $this->share();
        $other = $this->signedIn('other-session');
        $this->finishedRun($mine = $this->teammate('Mine', [], $other), 'Hi', 'Hello', 'completed', $other);
        $this->postJson('/api/sharing/links', [...$this->source(['agentId' => $mine['id']]), 'snapshotHash' => $this->preview(['agentId' => $mine['id']])->json('preview.snapshotHash'), 'confirm' => true])->assertCreated();
        $this->assertSame(3, DB::table('shared_links')->count());
        app(\App\Services\Account\AccountDeletion::class)->delete($this->user);
        $this->assertSame(1, DB::table('shared_links')->count());
        $this->assertSame($other->id, (int) DB::table('shared_links')->value('user_id'));
        $this->page($token)->assertNotFound();
        $this->page($second)->assertNotFound();
        $this->assertSame(0, User::where('id', $this->user->id)->count());
    }

    public function test_a_link_whose_owner_row_is_gone_is_dead_even_without_the_cascade(): void
    {
        [, $token] = $this->share();
        DB::statement('PRAGMA foreign_keys = OFF');
        DB::table('users')->where('id', $this->user->id)->delete();
        $this->page($token)->assertNotFound();
        DB::statement('PRAGMA foreign_keys = ON');
    }
}
