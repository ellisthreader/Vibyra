<?php
namespace Tests\Feature;

use App\Jobs\{CheckPhoneReceipt, DeliverPhoneNotification};
use App\Services\Notifications\{PhonePush, Preferences};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http, Queue};
use Tests\Support\PhonePushFixture;
use Tests\TestCase;

final class StageOneNotificationDeliveryTest extends TestCase
{
    use RefreshDatabase, PhonePushFixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootPhonePush();
    }

    public function test_uncertain_apns_push_is_never_sent_twice(): void
    {
        $calls = 0;
        Http::fake(function () use (&$calls) { $calls++; throw new \Illuminate\Http\Client\ConnectionException('response lost'); });
        $this->registerApns();
        $this->mac([], [self::row('t:12')]);
        $this->mac([self::row('t:12')]);
        $delivery = DB::table('notification_deliveries')->sole();
        $this->assertSame(['failed', 'DeliveryUnconfirmed'], [$delivery->state, $delivery->error]);
        $this->travel(20)->minutes();
        (new DeliverPhoneNotification($delivery->id))->handle();
        $this->assertSame(1, $calls);
        $this->assertSame(1, DB::table('notification_items')->count());
    }

    public function test_old_apns_success_cannot_change_new_token_host(): void
    {
        $id = $this->registerApns('production');
        Http::fake(function () use ($id) {
            DB::table('notification_devices')->where('id', $id)->update(['generation' => 2, 'apns_host' => 'sandbox']);
            return Http::response('', 200);
        });
        $this->mac([], [self::row('t:12')]);
        $this->mac([self::row('t:12')]);
        $this->assertSame('sandbox', DB::table('notification_devices')->where('id', $id)->value('apns_host'));
    }

    public function test_agent_failure_obeys_failed_switch_independently_of_attention(): void
    {
        $p = (object) ['attention' => true, 'failures' => false, 'replies' => true];
        $preferences = app(Preferences::class);
        $this->assertFalse($preferences->allows($p, 'attention', 'agent_failed'));
        $this->assertTrue($preferences->allows($p, 'attention', 'agent_approval'));
        $this->assertTrue($preferences->allows($p, 'replies', 'agent_completed'));
    }

    public function test_authenticated_apns_requests_never_follow_redirects(): void
    {
        $redirects = null;
        Http::fake(function ($request, $options) use (&$redirects) {
            $redirects = $options['allow_redirects'];
            return Http::response('', 302, ['Location' => 'https://unrelated.example/collect']);
        });
        $this->registerApns();
        $this->mac([], [self::row('t:12')]);
        $this->mac([self::row('t:12')]);
        $this->assertFalse($redirects);
        Http::assertSentCount(1);
        $this->assertSame('failed', DB::table('notification_deliveries')->value('state'));
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('retiredRecipients')]
    public function test_retired_recipient_cannot_receive_queued_alert(string $change): void
    {
        Queue::fake();
        $id = $this->registerApns();
        $this->mac([], [self::row('t:12')]);
        $this->mac([self::row('t:12')]);
        $device = DB::table('notification_devices')->find($id);
        match ($change) {
            'generation' => DB::table('notification_devices')->where('id', $id)->increment('generation'),
            'revoked' => DB::table('notification_devices')->where('id', $id)->update(['revoked_at' => now()]),
            'expired_session' => DB::table('vibyra_sessions')->where('id', $device->session_id)->update(['idle_expires_at' => now()->subSecond()]),
            'signed_out' => DB::table('vibyra_sessions')->where('id', $device->session_id)->update(['revoked_at' => now()]),
        };
        (new DeliverPhoneNotification(DB::table('notification_deliveries')->value('id')))->handle();
        Http::assertNothingSent();
        $this->assertSame('suppressed', DB::table('notification_deliveries')->value('state'));
    }

    public static function retiredRecipients(): array
    {
        return array_map(fn ($kind) => [$kind], ['generation', 'revoked', 'expired_session', 'signed_out']);
    }

    public function test_late_expo_receipt_cannot_revoke_new_device_generation(): void
    {
        Queue::fake();
        $id = $this->registerApns();
        $this->mac([], [self::row('t:12')]);
        $this->mac([self::row('t:12')]);
        $delivery = DB::table('notification_deliveries')->sole();
        DB::table('notification_deliveries')->where('id', $delivery->id)->update(['state' => 'ticketed', 'ticket' => 'old-ticket']);
        DB::table('notification_devices')->where('id', $id)->increment('generation');
        $redirects = null;
        Http::fake(function ($request, $options) use (&$redirects) {
            $redirects = $options['allow_redirects'];
            return Http::response(['data' => ['old-ticket' => ['status' => 'error', 'details' => ['error' => 'DeviceNotRegistered']]]]);
        });
        (new CheckPhoneReceipt($delivery->id))->handle();
        $this->assertNull(DB::table('notification_devices')->where('id', $id)->value('revoked_at'));
        $this->assertFalse($redirects);
    }
}
