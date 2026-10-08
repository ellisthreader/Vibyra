<?php

namespace Tests\Feature;

use App\Services\Reliability\FailureAlerts;
use Illuminate\Contracts\Queue\Job;
use Illuminate\Queue\Events\JobFailed;
use Illuminate\Support\Facades\{Cache, Http};
use Tests\TestCase;

/** Roadmap Part 19: queue failure alerts through the Discord relay, rate limited, class and count only. */
class ReliabilityAlertsTest extends TestCase
{
    private const HOOK = 'https://discord.com/api/webhooks/123456789/abcDEF-token';

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Http::preventStrayRequests();
        Http::fake(['discord.com/*' => Http::response('', 204)]);
        config(['reliability.alerts.enabled' => true, 'reliability.alerts.webhook_url' => self::HOOK,
            'reliability.alerts.window_minutes' => 15, 'services.desktop_reports.webhook_url' => null]);
    }

    private function jobFails(string $class = 'App\Jobs\SendThing', string $message = 'secret@example.test exploded'): void
    {
        $job = $this->createStub(Job::class);
        $job->method('resolveName')->willReturn($class);
        $job->method('getQueue')->willReturn('notifications');
        event(new JobFailed('database', $job, new \RuntimeException($message)));
    }

    public function test_it_sends_nothing_while_the_flag_is_off(): void
    {
        config(['reliability.alerts.enabled' => false]);
        $this->jobFails();
        FailureAlerts::exhausted('PlatformWebhookDelivery');
        Http::assertNothingSent();
    }

    public function test_a_failed_job_sends_one_alert_with_the_class_and_count_and_no_payload(): void
    {
        $this->jobFails('App\Jobs\SendThing', 'alice@example.test card 4242 token=vyk_SECRET');
        Http::assertSentCount(1);
        Http::assertSent(function ($request) {
            $text = $request['content'];
            $this->assertSame(self::HOOK, $request->url());
            $this->assertStringContainsString('App\Jobs\SendThing', $text);
            $this->assertStringContainsString('1 time', $text);
            $this->assertStringNotContainsString('alice', $text);
            $this->assertStringNotContainsString('4242', $text);
            $this->assertStringNotContainsString('vyk_', $text);
            $this->assertSame(['parse' => []], $request['allowed_mentions']);
            return true;
        });
    }

    public function test_one_alert_per_class_per_window(): void
    {
        foreach (range(1, 5) as $i) $this->jobFails('App\Jobs\A');
        $this->jobFails('App\Jobs\B');
        Http::assertSentCount(2); // A once, B once
        $this->travel(16)->minutes();
        $this->jobFails('App\Jobs\A');
        Http::assertSentCount(3);
    }

    public function test_the_alert_after_the_window_reports_the_failures_in_between(): void
    {
        foreach (range(1, 4) as $i) $this->jobFails('App\Jobs\A'); // 1 sent, 3 counted
        $this->travel(16)->minutes();
        $this->jobFails('App\Jobs\A');
        $messages = collect(Http::recorded())->map(fn ($pair) => $pair[0]['content'])->values();
        $this->assertCount(2, $messages);
        $this->assertStringContainsString('1 time since', $messages[0]);
        $this->assertStringContainsString('4 times since', $messages[1]);
    }

    public function test_an_exhausted_sweeper_alerts_by_its_fixed_name(): void
    {
        FailureAlerts::exhausted('PlatformWebhookDelivery');
        FailureAlerts::exhausted('PlatformWebhookDelivery');
        Http::assertSentCount(1);
        Http::assertSent(fn ($r) => str_contains($r['content'], 'PlatformWebhookDelivery') && str_contains($r['content'], 'retries exhausted'));
    }

    public function test_a_missing_or_foreign_webhook_sends_nothing_and_never_throws(): void
    {
        foreach ([null, '', 'http://discord.com/api/webhooks/1/x', 'https://evil.example/api/webhooks/1/x'] as $url) {
            config(['reliability.alerts.webhook_url' => $url]);
            Cache::flush();
            $this->jobFails();
        }
        Http::assertNothingSent();
    }

    public function test_it_falls_back_to_the_report_relay_webhook(): void
    {
        config(['reliability.alerts.webhook_url' => null, 'services.desktop_reports.webhook_url' => 'https://discord.com/api/webhooks/9/reportHook']);
        $this->jobFails();
        Http::assertSent(fn ($r) => $r->url() === 'https://discord.com/api/webhooks/9/reportHook');
    }

    public function test_a_failing_discord_never_breaks_the_job_failure_path(): void
    {
        Http::fake(['discord.com/*' => Http::failedConnection()]);
        $this->jobFails();
        $this->assertTrue(true);
    }

    public function test_a_real_failing_job_on_the_queue_raises_the_alert(): void
    {
        $job = new ReliabilityAlertsFailingJob();
        try { dispatch($job); } catch (\Throwable) {}
        Http::assertSentCount(1);
        Http::assertSent(fn ($r) => !str_contains($r['content'], 'private detail') && str_contains($r['content'], 'job failed'));
    }
}

final class ReliabilityAlertsFailingJob implements \Illuminate\Contracts\Queue\ShouldQueue
{
    use \Illuminate\Foundation\Bus\Dispatchable, \Illuminate\Queue\InteractsWithQueue;

    public $tries = 1;

    public function handle(): void
    {
        throw new \RuntimeException('private detail');
    }
}
