<?php
namespace Tests\Feature;

use App\Jobs\SendLiveActivityUpdate;
use App\Models\{User, VibyraSession};
use App\Services\LiveActivities\Dispatcher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, Crypt, DB, Http, Queue};
use Illuminate\Support\Str;
use Tests\Support\LiveActivityHarness;
use Tests\TestCase;

/** Tokens, preferences, the flag and revocation: who may register what, and what stops pushes. */
class LiveActivitiesAccessTest extends TestCase
{
    use RefreshDatabase, LiveActivityHarness;
    public function test_tokens_are_stored_encrypted_and_only_for_the_owners_run_and_current_device(): void
    {
        $run = $this->runInState();
        $this->register($run)->assertOk()->assertJsonStructure(['id']);
        $row = DB::table('live_activity_tokens')->sole();
        $this->assertNotSame(self::TOKEN, $row->token);
        $this->assertSame(self::TOKEN, Crypt::decryptString($row->token));
        $this->assertStringNotContainsString(self::TOKEN, json_encode($row));
        $this->register((string) Str::uuid())->assertNotFound();
        $this->phone()->putJson('/api/notifications/v1/live-activities/runs/'.$run.'/token', ['deviceId' => (string) Str::uuid(),
            'agentId' => $this->agent['id'], 'token' => self::TOKEN])->assertNotFound();
        $this->phone()->putJson('/api/notifications/v1/live-activities/runs/'.$run.'/token', ['deviceId' => $this->deviceId,
            'agentId' => $this->agent['id'], 'token' => 'not-hex'])->assertStatus(422);
        $other = User::factory()->create();
        VibyraSession::create(['user_id' => $other->id, 'token_hash' => hash('sha256', 'intruder')]);
        $this->withToken('intruder')->putJson('/api/notifications/v1/live-activities/runs/'.$run.'/token', ['deviceId' => $this->deviceId,
            'agentId' => $this->agent['id'], 'token' => self::TOKEN])->assertNotFound();
    }

    public function test_details_are_off_by_default_and_the_toggle_adds_only_a_fixed_phrase(): void
    {
        $run = $this->runInState();
        $this->register($run)->assertOk();
        $this->phone()->getJson('/api/notifications/v1/live-activities/preferences')->assertOk()
            ->assertJsonPath('preferences.details', false)->assertJsonPath('preferences.enabled', true)->assertJsonPath('available', true);
        app(Dispatcher::class)->deliver($run);
        $this->assertArrayNotHasKey('phrase', json_decode($this->sentApns()[0]->body(), true)['aps']['content-state']);
        $this->phone()->patchJson('/api/notifications/v1/live-activities/preferences', ['details' => true])->assertOk()->assertJsonPath('preferences.details', true);
        DB::table('live_activity_tokens')->update(['last_phase' => null]);
        app(Dispatcher::class)->deliver($run);
        $state = json_decode($this->sentApns()[1]->body(), true)['aps']['content-state'];
        $this->assertSame('thinking', $state['phrase']);
        $this->assertArrayNotHasKey('project', $state);
    }

    public function test_disabled_preference_and_disabled_flag_send_nothing(): void
    {
        $run = $this->runInState();
        $this->register($run)->assertOk();
        $this->phone()->patchJson('/api/notifications/v1/live-activities/preferences', ['enabled' => false])->assertOk();
        app(Dispatcher::class)->deliver($run);
        $this->assertCount(0, $this->sentApns());
        $this->phone()->patchJson('/api/notifications/v1/live-activities/preferences', ['enabled' => true])->assertOk();
        config(['live_activities.enabled' => false]);
        Queue::fake();
        app(Dispatcher::class)->deliver($run);
        $this->move($run, 'waiting_for_tool');
        Queue::assertNothingPushed();
        $this->assertCount(0, $this->sentApns());
        $this->register($run)->assertStatus(503);
        $this->phone()->getJson('/api/notifications/v1/live-activities/preferences')->assertOk()->assertJsonPath('available', false);
    }

    public function test_logout_device_removal_and_account_deletion_stop_pushes(): void
    {
        $run = $this->runInState();
        $this->register($run)->assertOk();
        // The phone clears its cards on sign-out.
        $this->phone()->deleteJson('/api/notifications/v1/live-activities', ['deviceId' => $this->deviceId])->assertOk();
        $this->assertSame(0, DB::table('live_activity_tokens')->count());
        $this->register($run)->assertOk();
        // A revoked session is enough: nothing is sent to its tokens, and they are dropped.
        VibyraSession::where('token_hash', hash('sha256', 'phone-session'))->update(['revoked_at' => now()]);
        app(Dispatcher::class)->deliver($run);
        $this->assertCount(0, $this->sentApns());
        $this->assertSame(0, DB::table('live_activity_tokens')->count());
        // Removing the notification device revokes its tokens.
        VibyraSession::where('token_hash', hash('sha256', 'phone-session'))->update(['revoked_at' => null]);
        $this->register($run)->assertOk();
        $this->phone()->deleteJson('/api/notifications/v1/devices/'.$this->deviceId)->assertOk();
        $this->assertSame(0, DB::table('live_activity_tokens')->count());
        // Deleting the account removes the rest.
        DB::table('notification_devices')->update(['revoked_at' => null]);
        $this->register($run)->assertOk();
        $this->assertSame(1, DB::table('live_activity_tokens')->count());
        DB::table('users')->where('id', $this->user->id)->delete();
        $this->assertSame(0, DB::table('live_activity_tokens')->count());
    }

    public function test_ending_a_card_on_the_phone_stops_updates_for_it(): void
    {
        $run = $this->runInState();
        $this->register($run)->assertOk();
        $this->phone()->deleteJson('/api/notifications/v1/live-activities/runs/'.$run.'/token', ['deviceId' => $this->deviceId])->assertOk();
        app(Dispatcher::class)->deliver($run);
        $this->assertCount(0, $this->sentApns());
    }
}
