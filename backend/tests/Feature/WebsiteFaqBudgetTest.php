<?php

namespace Tests\Feature;

use App\Services\Website\{FaqAnswerer, FaqBudget, FaqKnowledge};
use Illuminate\Support\Facades\{Cache, Http};
use Tests\TestCase;

class WebsiteFaqBudgetTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        config(['website_faq.cache_store' => 'array', 'website_faq.daily_calls' => 100,
            'website_faq.daily_budget_micro_usd' => 1000000, 'website_faq.concurrent_calls' => 2,
            'services.openai.key' => 'test-key']);
    }

    public function test_global_daily_call_limit_survives_different_questions_and_failures(): void
    {
        config(['website_faq.daily_calls' => 1]);
        Http::fake(['*' => Http::response(['error' => 'unavailable'], 500)]);
        $first = app(FaqAnswerer::class)->answer('How do terminals work?');
        $second = app(FaqAnswerer::class)->answer('What does a different thing do?');
        $this->assertTrue($first['fallback']);
        $this->assertTrue($second['fallback']);
        Http::assertSentCount(1);
    }

    public function test_retry_consumes_budget_and_stops_before_a_second_provider_request(): void
    {
        config(['website_faq.daily_budget_micro_usd' => 100000]);
        Http::fake(['*' => Http::response(['choices' => [['message' => ['content' => '']]]])]);
        $result = app(FaqAnswerer::class)->answer('What are these terminals?');
        $this->assertTrue($result['fallback']);
        Http::assertSentCount(1);
    }

    public function test_concurrency_slots_fail_closed_and_are_released_after_failure(): void
    {
        $one = Cache::store('array')->lock('website-faq:slot:0', 120);
        $two = Cache::store('array')->lock('website-faq:slot:1', 120);
        $one->get(); $two->get();
        Http::fake();
        $this->assertTrue(app(FaqAnswerer::class)->answer('How does it work?')['fallback']);
        Http::assertNothingSent();
        $one->release(); $two->release();
        try { app(FaqBudget::class)->run(fn () => throw new \RuntimeException('network')); }
        catch (\RuntimeException) {}
        $this->assertSame('available', app(FaqBudget::class)->run(fn () => 'available'));
    }

    public function test_no_provider_key_and_unsafe_production_cache_use_static_fallback(): void
    {
        Http::fake();
        config(['services.openai.key' => null]);
        $this->assertTrue(app(FaqAnswerer::class)->answer('What does Pro cost?')['fallback']);
        config(['services.openai.key' => 'fake']);
        $this->app->detectEnvironment(fn () => 'production');
        $this->assertTrue(app(FaqAnswerer::class)->answer('Can I use terminals?')['fallback']);
        Http::assertNothingSent();
    }

    public function test_only_current_public_catalogue_prices_are_in_knowledge(): void
    {
        $text = app(FaqKnowledge::class)->text();
        $this->assertStringContainsString('Vibyra Pro: £19.99 per month, 300 tokens', $text);
        $this->assertStringContainsString('£199.99 per year, tokens up front, 3600 tokens', $text);
        $this->assertStringContainsString('Website purchase: not available yet', $text);
        $this->assertStringNotContainsString('Builder: £49', $text);
        config(['membership.offers.pro_monthly.pence' => 2500]);
        $this->assertStringContainsString('Vibyra Pro: £25.00', app(FaqKnowledge::class)->text());
    }
}
