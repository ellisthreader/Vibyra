<?php

namespace Tests\Feature;

use App\Services\ModelResilience\ProviderBreaker;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/** The per-model circuit breaker: open after repeated failures, cool down, one half-open probe. */
class ProviderBreakerTest extends TestCase
{
    private ProviderBreaker $breaker;

    protected function setUp(): void
    {
        parent::setUp();
        config(['model_resilience.failover.breaker' => ['threshold' => 3, 'window' => 60, 'cooldown' => 45, 'probe_ttl' => 30]]);
        Carbon::setTestNow('2026-10-02 12:00:00');
        $this->breaker = new ProviderBreaker();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_it_stays_closed_below_the_threshold_and_opens_at_it(): void
    {
        $this->breaker->failure('m'); $this->breaker->failure('m');
        $this->assertSame('closed', $this->breaker->state('m'));
        $this->assertTrue($this->breaker->allow('m'));
        $this->breaker->failure('m');
        $this->assertSame('open', $this->breaker->state('m'));
        $this->assertFalse($this->breaker->allow('m'));
        $this->assertSame(45, $this->breaker->retryAfter('m'));
    }

    public function test_failures_outside_the_window_do_not_add_up(): void
    {
        $this->breaker->failure('m'); $this->breaker->failure('m');
        Carbon::setTestNow(now()->addSeconds(61));
        $this->breaker->failure('m');
        $this->assertSame('closed', $this->breaker->state('m'));
    }

    public function test_after_the_cooldown_exactly_one_probe_is_let_through(): void
    {
        foreach ([1, 2, 3] as $_) $this->breaker->failure('m');
        Carbon::setTestNow(now()->addSeconds(46));
        $this->assertSame('half_open', $this->breaker->state('m'));
        $this->assertTrue($this->breaker->allow('m'), 'the first caller is the probe');
        $this->assertFalse($this->breaker->allow('m'), 'everyone else is still refused while the probe is out');
        $this->assertFalse($this->breaker->allow('m'));
    }

    public function test_a_successful_probe_closes_and_a_failed_one_reopens(): void
    {
        foreach ([1, 2, 3] as $_) $this->breaker->failure('m');
        Carbon::setTestNow(now()->addSeconds(46));
        $this->assertTrue($this->breaker->allow('m'));
        $this->breaker->success('m');
        $this->assertSame('closed', $this->breaker->state('m'));
        $this->assertTrue($this->breaker->allow('m'));

        foreach ([1, 2, 3] as $_) $this->breaker->failure('m');
        Carbon::setTestNow(now()->addSeconds(46));
        $this->assertTrue($this->breaker->allow('m'));
        $this->breaker->failure('m');
        $this->assertSame('open', $this->breaker->state('m'), 'a failed probe starts a fresh cooldown');
        $this->assertSame(45, $this->breaker->retryAfter('m'));
    }

    public function test_breakers_are_per_key(): void
    {
        foreach ([1, 2, 3] as $_) $this->breaker->failure('a');
        $this->assertFalse($this->breaker->allow('a'));
        $this->assertTrue($this->breaker->allow('b'));
        $this->assertFalse($this->breaker->allow('b', 'a'), 'a model is refused when its vendor key is open');
    }

    public function test_the_counter_uses_atomic_cache_increments_not_the_rate_limiter(): void
    {
        $source = file_get_contents(app_path('Services/ModelResilience/ProviderBreaker.php'));
        $this->assertStringContainsString('Cache::increment', $source);
        $this->assertStringNotContainsString('RateLimiter::hit(', $source);
    }

    public function test_a_cache_outage_lets_requests_through_instead_of_failing_them(): void
    {
        config(['cache.default' => 'no-such-store']);
        app('cache')->forgetDriver();
        $this->assertTrue($this->breaker->allow('m'));
        $this->breaker->failure('m');
        $this->breaker->success('m');
    }
}
