<?php

namespace Tests\Feature;

use App\Jobs\DeliverPlatformWebhook;
use App\Models\{AccountAuditEvent, WebhookDelivery, WebhookEndpoint};
use App\Models\AgentV2\Run;
use App\Services\AgentRuns\{Lifecycle, RunStates};
use App\Services\Platform\{WebhookEndpoints, WebhookEvents, WebhookSender};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Crypt, DB, Http, Queue};
use Tests\Support\{AgentV2Fixture, PlatformWebhookFixture};
use Tests\TestCase;

/** Roadmap Part 11: outbound webhooks (signed, SSRF-safe, queued with backoff, logged, auto-paused, ids and state only). */
class PlatformWebhooksTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, PlatformWebhookFixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootWebhooks();
    }

    public function test_run_events_are_signed_and_carry_only_ids_and_state(): void
    {
        [, $secret] = $this->endpoint();
        Http::fake(['hooks.example.test/*' => Http::response('ok', 200)]);
        $run = $this->newRun();
        $this->move($run, RunStates::STARTING, RunStates::RUNNING);
        $sent = collect(Http::recorded())->map(fn ($p) => $p[0])->sole();
        $this->assertSame('POST', $sent->method());
        $ts = (int) $sent->header('Vibyra-Timestamp')[0];
        $this->assertEqualsWithDelta(time(), $ts, 5);
        $this->assertSame('v1='.hash_hmac('sha256', $ts.'.'.$sent->body(), $secret), $sent->header('Vibyra-Signature')[0]);
        $this->assertSame('run.started', $sent->header('Vibyra-Event')[0]);
        $body = json_decode($sent->body(), true);
        $this->assertSame(['id', 'type', 'createdAt', 'data'], array_keys($body));
        $this->assertSame(['runId' => $run->id, 'agentId' => $this->agent['id'], 'state' => 'running'], $body['data']);
        $this->assertSame($body['id'], $sent->header('Vibyra-Delivery')[0]);
        foreach (['Secret prompt', 'acme-merger', 'prompt', 'answer'] as $leak) $this->assertStringNotContainsString($leak, $sent->body());
        $this->assertSame('delivered', WebhookDelivery::sole()->state);
    }

    public function test_started_completed_failed_and_needs_approval_map_from_the_run_lifecycle(): void
    {
        $this->endpoint();
        Http::fake(['hooks.example.test/*' => Http::response('ok', 200)]);
        $a = $this->newRun();
        $this->move($a, RunStates::STARTING, RunStates::RUNNING, RunStates::WAITING_APPROVAL, RunStates::RUNNING, RunStates::WAITING_APPROVAL, RunStates::RUNNING, RunStates::COMPLETED);
        $b = $this->newRun();
        $this->move($b, RunStates::STARTING, RunStates::RUNNING, RunStates::FAILED);
        $events = WebhookDelivery::orderBy('created_at')->get()->groupBy(fn ($d) => $d->payload['data']['runId'])->map(fn ($g) => $g->pluck('event')->sort()->values()->all());
        $this->assertSame(['run.completed', 'run.needs_approval', 'run.needs_approval', 'run.started'], $events[$a->id]);
        $this->assertSame(['run.failed', 'run.started'], $events[$b->id]);
    }

    public function test_a_repeated_transition_or_a_second_emit_sends_nothing_twice_and_subscriptions_filter(): void
    {
        $this->endpoint(['run.failed']);
        $this->endpoint(['run.started', 'run.failed'], 'https://other.example.test/hook');
        Http::fake(fn () => Http::response('ok', 200));
        $run = $this->newRun();
        $this->move($run, RunStates::STARTING, RunStates::RUNNING);
        $this->assertSame(1, WebhookDelivery::count());
        app(WebhookEvents::class)->emit($run, 'run.started', $run->id.':run.started');
        $this->assertSame(1, WebhookDelivery::count());
        $this->move($run, RunStates::FAILED);
        $this->assertSame(3, WebhookDelivery::count());
    }

    public function test_failures_retry_with_exponential_backoff_then_end_as_failed(): void
    {
        Queue::fake();
        $this->endpoint(['run.failed']);
        Http::fake(['hooks.example.test/*' => Http::response('nope', 500)]);
        $run = $this->newRun();
        $this->move($run, RunStates::FAILED);
        $d = WebhookDelivery::sole();
        $sender = app(WebhookSender::class);
        $waits = [];
        for ($i = 1; $i <= 5; $i++) {
            $sender->attempt($d->id);
            $d->refresh();
            $this->assertSame($i, $d->attempts);
            $this->assertSame('pending', $d->state);
            $this->assertSame('http_500', $d->error);
            $waits[] = (int) now()->diffInSeconds($d->next_attempt_at, true);
            $sender->attempt($d->id); // not due yet: nothing is sent
            $this->assertSame($i, $d->fresh()->attempts);
            $this->travel($waits[$i - 1] + 1)->seconds();
        }
        $this->assertEqualsWithDelta([30, 60, 120, 240, 480], $waits, 1);
        Queue::assertPushed(DeliverPlatformWebhook::class, 6); // the first offer and one per retry
        $sender->attempt($d->id);
        $d->refresh();
        $this->assertSame(['failed', 6, null], [$d->state, $d->attempts, $d->next_attempt_at]);
        $this->assertSame(500, $d->response_status);
        $this->assertSame(1, WebhookEndpoint::sole()->failures);
        $sender->attempt($d->id);
        $this->assertSame(6, $d->fresh()->attempts);
    }

    public function test_five_failed_deliveries_in_a_row_pause_the_endpoint_and_success_resets_the_count(): void
    {
        Queue::fake();
        config(['platform.webhook_attempts' => 1]);
        $this->endpoint(['run.failed']);
        $sender = app(WebhookSender::class);
        Http::fake(['hooks.example.test/*' => Http::sequence()->push('x', 500)->push('x', 500)->push('ok', 200)->push('x', 500)->push('x', 500)->push('x', 500)->push('x', 500)->push('x', 500)]);
        foreach (range(1, 2) as $i) { $this->move($this->newRun(), RunStates::FAILED); }
        foreach (WebhookDelivery::pluck('id') as $id) $sender->attempt($id);
        $this->assertSame(2, WebhookEndpoint::sole()->failures);
        $this->move($this->newRun(), RunStates::FAILED);
        $sender->attempt(WebhookDelivery::where('state', 'pending')->value('id'));
        $this->assertSame(0, WebhookEndpoint::sole()->failures, 'a 2xx resets the run of failures');
        for ($i = 0; $i < 5; $i++) {
            $this->move($this->newRun(), RunStates::FAILED);
            $sender->attempt(WebhookDelivery::where('state', 'pending')->value('id'));
        }
        $endpoint = WebhookEndpoint::sole();
        $this->assertSame(['failing', 5], [$endpoint->paused_reason, $endpoint->failures]);
        $this->assertNotNull($endpoint->paused_at);
        $paused = AccountAuditEvent::where('event', 'webhook.paused')->sole();
        $this->assertSame('system', $paused->actor);
        $before = WebhookDelivery::count();
        $this->move($this->newRun(), RunStates::FAILED);
        $this->assertSame($before, WebhookDelivery::count(), 'a paused endpoint is sent nothing');
        $resumed = app(WebhookEndpoints::class)->pause($this->user->id, $endpoint->id, false);
        $this->assertSame([null, 0], [$resumed->paused_at, $resumed->failures]);
    }
}
