<?php
namespace Tests\Feature\SpendCaps;

use App\Jobs\DeliverPhoneNotification;
use App\Models\VibyraSession;
use App\Services\Notifications\{Devices, Inbox, Preferences};
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\{DB, Http};
use Illuminate\Support\Str;

class SpendCapsAlertsTest extends SpendCapsTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-10-02 12:00:00'));
        config(['intelligence.push' => true, 'intelligence.expo_project' => '00000000-0000-4000-8000-000000000001']);
        Http::preventStrayRequests();
        app(Preferences::class)->get($this->user->id);
        $s = VibyraSession::create(['user_id' => $this->user->id, 'token_hash' => hash('sha256', 'phone'),
            'idle_expires_at' => now()->addDay(), 'absolute_expires_at' => now()->addDays(2)]);
        app(Devices::class)->register($s, ['installation' => (string) Str::uuid(), 'proof' => str_repeat('p', 64),
            'token' => 'ExpoPushToken[fixture]', 'environment' => 'development', 'projectId' => config('intelligence.expo_project')]);
    }

    private function spend(int $micro): void
    {
        $this->settle($this->submit(), $micro);
    }

    private function phases(): array
    {
        return DB::table('work_events')->where('source', 'spend_cap')->orderBy('id')->pluck('phase')->all();
    }

    public function test_one_alert_at_80_and_one_at_100_per_period(): void
    {
        $this->caps(day: 25);
        $this->spend(100_000);
        $this->assertSame([], $this->phases(), '40% is quiet');
        $this->spend(100_000);
        $this->assertSame(['spend_80'], $this->phases());
        $this->spend(10_000);
        $this->assertSame(['spend_80'], $this->phases(), 'no repeat at 84%');
        $this->spend(60_000);
        $this->assertSame(['spend_80', 'spend_100'], $this->phases());
        $this->expectException(\App\Services\Spend\Refusal::class); // at 108% the cap itself now refuses
        $this->spend(10_000);
    }

    public function test_crossing_both_thresholds_at_once_sends_only_the_100_alert_and_a_new_day_starts_afresh(): void
    {
        $this->caps(day: 1);
        $this->spend(10_000);
        $this->assertSame(['spend_100'], $this->phases());
        $this->travelTo(Carbon::parse('2026-10-03 12:00:00'));
        $this->spend(10_000);
        $this->assertSame(['spend_100', 'spend_100'], $this->phases());
    }

    public function test_changing_a_cap_resets_its_thresholds(): void
    {
        $this->caps(day: 1);
        $this->spend(10_000);
        $this->putJson('/api/vibes/spend-caps', ['day' => 2])->assertOk();
        $this->spend(10_000);
        $this->assertSame(['spend_100', 'spend_100'], $this->phases());
    }

    public function test_the_alert_reaches_the_inbox_as_the_spend_category_and_pushes_once(): void
    {
        $this->caps(day: 1);
        $this->spend(10_000);
        app(Inbox::class)->publish((int) DB::table('work_events')->value('id'));
        $item = DB::table('notification_items')->first();
        $this->assertSame(['spend', 'You have reached your daily limit'], [$item->category, $item->title]);
        $this->assertSame('spend_cap', json_decode($item->destination, true)['source']);
        $this->assertTrue(app(Inbox::class)->current($item));
        Http::fake(['exp.host/--/api/v2/push/send' => Http::response(['data' => ['status' => 'ok', 'id' => 'ticket']])]);
        (new DeliverPhoneNotification((int) DB::table('notification_deliveries')->value('id')))->handle();
        Http::assertSent(fn ($r) => $r['title'] === 'You have reached your daily limit' && !str_contains(json_encode($r->data()), 'Secret'));
    }

    public function test_the_preference_switch_stops_events_and_a_later_switch_suppresses_delivery(): void
    {
        $this->caps(day: 1);
        $this->spend(10_000);
        app(Inbox::class)->publish((int) DB::table('work_events')->value('id'));
        $this->putJson('/api/vibes/spend-caps', ['alerts' => false])->assertOk()->assertJsonPath('spendCaps.alerts', false);
        Http::fake();
        $id = (int) DB::table('notification_deliveries')->value('id');
        (new DeliverPhoneNotification($id))->handle();
        Http::assertNothingSent();
        $this->assertDatabaseHas('notification_deliveries', ['id' => $id, 'state' => 'suppressed']);
        $this->caps(day: 1); // fresh thresholds, alerts still off: nothing new is written
        $before = count($this->phases());
        $this->travelTo(Carbon::parse('2026-10-03 12:00:00'));
        $this->spend(10_000);
        $this->assertCount($before, $this->phases());
    }

    public function test_quiet_hours_hold_the_push_back(): void
    {
        $this->caps(day: 1);
        $this->spend(10_000);
        app(Inbox::class)->publish((int) DB::table('work_events')->value('id'));
        DB::table('notification_preferences')->where('user_id', $this->user->id)->update(['quiet_start' => 11 * 60, 'quiet_end' => 13 * 60]);
        Http::fake();
        $id = (int) DB::table('notification_deliveries')->value('id');
        (new DeliverPhoneNotification($id))->handle();
        Http::assertNothingSent();
        $this->assertDatabaseHas('notification_deliveries', ['id' => $id, 'state' => 'pending']);
    }

    public function test_no_event_is_written_while_the_inbox_is_off(): void
    {
        config(['intelligence.inbox' => false]);
        $this->caps(day: 1);
        $this->spend(10_000);
        $this->assertSame([], $this->phases());
    }
}
