<?php

namespace Tests\Feature;

use App\Models\{AccountAuditEvent, AccountExport};
use App\Services\Platform\AccountActivity;
use App\Services\Privacy\AccountExports;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Storage};
use Illuminate\Support\Str;
use Tests\Support\{AccountExportFixture, AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/** Roadmap Part 19: self-serve "Download my data": flag, admission, signed delivery, contents, and that no secret leaves. */
class AccountExportTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes, AccountExportFixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
        Storage::fake('local');
        config(['reliability.export.enabled' => true, 'platform.activity' => true, 'reliability.export.disk' => 'local']);
    }

    public function test_it_is_not_there_while_the_flag_is_off(): void
    {
        config(['reliability.export.enabled' => false]);
        $this->getJson('/api/account/export')->assertNotFound()->assertJsonPath('code', 'not_available');
        $this->postJson('/api/account/export')->assertNotFound();
        $this->assertSame(0, AccountExport::count());
    }

    public function test_a_request_builds_an_archive_and_hands_back_a_signed_link(): void
    {
        $this->seedAccount();
        $this->getJson('/api/account/export')->assertOk()->assertJsonPath('status', 'none')->assertJsonPath('canRequest', true);
        $response = $this->postJson('/api/account/export')->assertStatus(202);
        $response->assertJsonPath('status', 'ready')->assertJsonPath('canRequest', false); // the sync queue ran the job
        $link = $response->json('link');
        $this->assertStringContainsString('signature=', $link);
        $files = $this->archive();
        $this->assertEqualsCanonicalizing(['account.json', 'settings.json', 'chats.json', 'projects.json', 'teammates.json', 'activity.json',
            'spend-caps.json', 'prompt-library.json', 'README.txt'], array_keys($files));
        $this->assertSame($this->user->email, json_decode($files['account.json'], true)['email']);
        $chat = collect(json_decode($files['chats.json'], true)['items'])->firstWhere('title', 'Plan the launch');
        $this->assertSame('Plan the launch', $chat['title']);
        $this->assertSame('Ship the small thing.', $chat['turns'][0]['response']);
        $team = json_decode($files['teammates.json'], true);
        $this->assertSame('Inbox', $team['teammates'][0]['name']);
        $this->assertSame('Triage', $team['skills'][0]['name']);
        $this->assertSame([$team['skills'][0]['id']], $team['teammates'][0]['skillIds']);
        $this->assertEquals(5, json_decode($files['spend-caps.json'], true)['perDay']);
        $this->assertSame('my-app', json_decode($files['projects.json'], true)['items'][0]['name']);
        $this->assertSame(['Standup'], array_column(json_decode($files['prompt-library.json'], true)['prompts'], 'title'));
        $this->assertContains('spend_cap.changed', array_column(json_decode($files['activity.json'], true)['items'], 'event'));
        $this->assertSame('dark', json_decode($files['settings.json'], true)['appState']['theme']);
    }

    public function test_the_signed_link_downloads_the_zip_and_only_while_signed_and_fresh(): void
    {
        $this->seedAccount();
        $link = $this->postJson('/api/account/export')->json('link');
        $this->withToken('')->get($link)->assertOk()->assertHeader('Content-Type', 'application/zip');
        $this->withToken('')->get(preg_replace('/signature=[^&]+/', 'signature=forged', $link))->assertForbidden();
        $this->withToken('')->get(preg_replace('#/account-export/[^/]+/#', '/account-export/'.Str::uuid().'/', $link))->assertForbidden();
        $this->travel(16)->minutes();
        $this->withToken('')->get($link)->assertForbidden(); // the link lives 15 minutes
        $this->travelBack();
        config(['reliability.export.link_minutes' => 1]);
        $link = $this->withToken('v2-session')->getJson('/api/account/export')->json('link');
        $this->travel(2)->minutes();
        $this->withToken('')->get($link)->assertForbidden();
        $this->travelBack();
        $fresh = $this->withToken('v2-session')->getJson('/api/account/export')->json('link');
        $this->withToken('')->get($fresh)->assertOk();
        $this->assertTrue(AccountAuditEvent::where('event', 'data_export.downloaded')->exists());
    }

    public function test_a_second_request_in_a_day_is_refused_until_the_day_is_up(): void
    {
        $this->postJson('/api/account/export')->assertStatus(202);
        $again = $this->postJson('/api/account/export')->assertStatus(429)->assertJsonPath('code', 'export_rate_limited');
        $this->assertNotEmpty($again->json('nextAllowedAt'));
        $this->assertSame(1, AccountExport::count());
        $this->travel(25)->hours();
        $this->postJson('/api/account/export')->assertStatus(202);
        $this->assertSame(2, AccountExport::count());
    }

    public function test_a_failed_build_does_not_use_up_the_day(): void
    {
        config(['reliability.export.disk' => 'no-such-disk']);
        $this->postJson('/api/account/export')->assertStatus(202)->assertJsonPath('status', 'failed')->assertJsonPath('canRequest', true);
        $this->assertSame('build_failed', AccountExport::first()->error);
    }

    public function test_a_build_that_never_finished_is_failed_after_half_an_hour(): void
    {
        $row = AccountExport::create(['user_id' => $this->user->id, 'status' => 'building', 'requested_at' => now()]);
        $this->getJson('/api/account/export')->assertJsonPath('status', 'building')->assertJsonPath('canRequest', false);
        $this->travel(31)->minutes();
        $this->getJson('/api/account/export')->assertJsonPath('status', 'failed')->assertJsonPath('canRequest', true);
        $this->assertSame('stalled', $row->fresh()->error);
    }

    public function test_it_is_recorded_in_the_activity_log_without_the_link(): void
    {
        $this->postJson('/api/account/export')->assertStatus(202);
        $event = AccountAuditEvent::where('event', 'data_export.requested')->firstOrFail();
        $this->assertSame($this->user->id, (int) $event->user_id);
        $this->assertNull($event->detail);
        $this->assertStringNotContainsString('signature', json_encode(AccountAuditEvent::all()->toArray()));
    }

    public function test_the_browser_session_has_the_same_actions_and_a_signed_out_browser_has_none(): void
    {
        $this->app['auth']->forgetGuards();
        $this->withToken('')->getJson('/web-api/account/export')->assertUnauthorized();
        $this->withToken('')->postJson('/web-api/account/export')->assertUnauthorized();
        $this->actingAs($this->user)->withToken('')->postJson('/web-api/account/export')->assertStatus(202)->assertJsonPath('status', 'ready');
    }

    public function test_expired_archives_are_deleted_and_their_links_stop_working(): void
    {
        $link = $this->postJson('/api/account/export')->json('link');
        $path = AccountExport::first()->path;
        Storage::disk('local')->assertExists($path);
        $this->travel(25)->hours();
        $this->artisan('vibyra:prune-account-exports')->assertSuccessful();
        Storage::disk('local')->assertMissing($path);
        $this->assertSame('expired', AccountExport::first()->status);
        $this->withToken('')->get($link)->assertForbidden(); // signature expired too; a fresh one finds nothing
        $status = app(AccountExports::class)->status($this->user);
        $this->assertSame('expired', $status['status']);
        $this->assertNull($status['link']);
    }

    public function test_an_archive_lost_with_its_disk_is_expired_not_offered_as_a_dead_link(): void
    {
        $this->postJson('/api/account/export')->assertStatus(202)->assertJsonPath('status', 'ready');
        Storage::disk('local')->delete(AccountExport::first()->path);
        $this->getJson('/api/account/export')->assertJsonPath('status', 'expired')->assertJsonPath('link', null);
    }

    public function test_a_very_large_account_is_cut_to_the_newest_and_says_so(): void
    {
        $this->seedAccount();
        foreach (range(1, 4) as $i) AccountActivity::record($this->user, 'spend_cap.changed', ['day' => $i]);
        config(['reliability.export.max_rows' => 3]);
        $this->postJson('/api/account/export')->assertStatus(202);
        $files = $this->archive();
        $activity = json_decode($files['activity.json'], true);
        $this->assertCount(3, $activity['items']);
        $this->assertStringContainsString('activity.json', $files['README.txt']);
    }
}
