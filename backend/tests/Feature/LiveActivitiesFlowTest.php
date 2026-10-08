<?php
namespace Tests\Feature;

use App\Jobs\SendLiveActivityUpdate;
use App\Services\LiveActivities\Dispatcher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, Crypt, DB, Http, Queue};
use Illuminate\Support\Str;
use Tests\Support\LiveActivityHarness;
use Tests\TestCase;

/** Run transitions to APNs pushes, against a fake APNs: headers, priorities, dismissal, push-to-start, no retry. */
class LiveActivitiesFlowTest extends TestCase
{
    use RefreshDatabase, LiveActivityHarness;

    public function test_a_transition_sends_one_liveactivity_push_with_the_right_headers_and_no_private_text(): void
    {
        $run = $this->runInState();
        $this->register($run)->assertOk();
        $this->move($run, 'waiting_for_approval');
        app(Dispatcher::class)->deliver($run);
        $sent = $this->sentApns();
        $this->assertCount(1, $sent);
        $r = $sent[0];
        $this->assertSame('https://api.sandbox.push.apple.com/3/device/'.self::TOKEN, $r->url());
        $this->assertSame('liveactivity', $r->header('apns-push-type')[0]);
        $this->assertSame('app.vibyra.mobile.push-type.liveactivity', $r->header('apns-topic')[0]);
        $this->assertSame('10', $r->header('apns-priority')[0]);
        $this->assertStringStartsWith('bearer ', $r->header('authorization')[0]);
        $body = json_decode($r->body(), true)['aps'];
        $this->assertSame('update', $body['event']);
        $this->assertSame('needs_approval', $body['content-state']['phase']);
        foreach (['SECRET', 'alice@', 'email', $run] as $private) $this->assertStringNotContainsString($private, $r->body());
    }

    public function test_same_phase_is_not_sent_twice_and_a_burst_is_one_job(): void
    {
        $run = $this->runInState();
        $this->register($run)->assertOk();
        Queue::fake();
        Cache::flush();
        $this->move($run, 'waiting_for_tool');
        $this->move($run, 'running');
        $this->move($run, 'waiting_for_tool');
        Queue::assertPushed(SendLiveActivityUpdate::class, 1);
        app(Dispatcher::class)->deliver($run);
        app(Dispatcher::class)->deliver($run);
        $this->assertCount(1, $this->sentApns(), 'the token already shows `working`');
    }

    public function test_priority_5_for_ordinary_progress_and_end_payloads_follow_the_dismissal_rules(): void
    {
        $run = $this->runInState();
        $this->register($run)->assertOk();
        app(Dispatcher::class)->deliver($run);
        $this->assertSame('5', $this->sentApns()[0]->header('apns-priority')[0]);
        $this->postJson($this->runnerPath('/runs/'.$run.'/complete'), ['generation' => $this->generationOf($run), 'answer' => 'Private answer.'], $this->runnerHeaders())->assertOk();
        app(Dispatcher::class)->deliver($run);
        $end = $this->sentApns()[1];
        $this->assertSame('10', $end->header('apns-priority')[0]);
        $aps = json_decode($end->body(), true)['aps'];
        $this->assertSame(['end', 'finished'], [$aps['event'], $aps['content-state']['phase']]);
        $this->assertSame($aps['timestamp'] + 900, $aps['dismissal-date']);
        $this->assertStringNotContainsString('Private answer', $end->body());
        $this->assertNotNull(DB::table('live_activity_tokens')->value('ended_at'));
        app(Dispatcher::class)->deliver($run);
        $this->assertCount(2, $this->sentApns(), 'an ended card is never pushed again');
    }

    public function test_push_to_start_starts_a_card_once_for_a_run_the_phone_did_not_start(): void
    {
        $this->phone()->putJson('/api/notifications/v1/live-activities/push-to-start', ['deviceId' => $this->deviceId, 'token' => self::START])->assertOk();
        $this->assertNotSame(self::START, DB::table('notification_devices')->value('push_to_start_token'));
        $run = $this->admit('Do the thing.')['id'];
        $this->claim();
        $this->move($run, 'running');
        $this->assertCount(0, $this->sentApns(), 'the journal hook only queues; it never calls APNs inside the run transition');
        app(Dispatcher::class)->deliver($run);
        $this->move($run, 'waiting_for_tool');
        $this->move($run, 'running');
        app(Dispatcher::class)->deliver($run);
        $sent = $this->sentApns();
        $this->assertCount(1, $sent);
        $this->assertSame('https://api.sandbox.push.apple.com/3/device/'.self::START, $sent[0]->url());
        $aps = json_decode($sent[0]->body(), true)['aps'];
        $this->assertSame(['start', 'VibyraRunAttributes'], [$aps['event'], $aps['attributes-type']]);
        $this->assertSame(['runId', 'agentId', 'name', 'avatar'], array_keys($aps['attributes']));
        $this->assertSame('Inbox', $aps['attributes']['name']);
        $this->assertArrayHasKey('alert', $aps);
        $this->assertSame('5', $sent[0]->header('apns-priority')[0]);
        $this->phone()->deleteJson('/api/notifications/v1/live-activities/push-to-start', ['deviceId' => $this->deviceId])->assertOk();
        $this->assertNull(DB::table('notification_devices')->value('push_to_start_token'));
    }

    public function test_a_run_the_phone_already_shows_is_not_started_again(): void
    {
        $this->phone()->putJson('/api/notifications/v1/live-activities/push-to-start', ['deviceId' => $this->deviceId, 'token' => self::START])->assertOk();
        $run = $this->runInState();
        $this->register($run)->assertOk();
        $this->move($run, 'waiting_for_tool');
        $this->move($run, 'running');
        app(Dispatcher::class)->deliver($run);
        $this->assertCount(0, array_filter($this->sentApns(), fn ($r) => str_contains($r->body(), '"start"')));
    }

    public function test_a_dead_token_is_revoked_and_a_throttled_or_failed_send_is_never_retried(): void
    {
        $run = $this->runInState();
        $this->register($run)->assertOk();
        $this->apns = [429, ['reason' => 'TooManyRequests']];
        app(Dispatcher::class)->deliver($run);
        $this->assertCount(1, $this->sentApns());
        $this->assertNull(DB::table('live_activity_tokens')->value('last_phase'));
        $this->assertSame(1, DB::table('live_activity_tokens')->count());
        $this->apns = [410, ['reason' => 'Unregistered']];
        app(Dispatcher::class)->deliver($run);
        $this->assertSame(0, DB::table('live_activity_tokens')->count());
    }

    public function test_cancelled_run_removes_the_card_at_once(): void
    {
        $run = $this->runInState();
        $this->register($run)->assertOk();
        $this->move($run, 'cancelled');
        app(Dispatcher::class)->deliver($run);
        $aps = json_decode($this->sentApns()[0]->body(), true)['aps'];
        $this->assertSame('end', $aps['event']);
        $this->assertLessThan($aps['timestamp'], $aps['dismissal-date']);
    }
}
