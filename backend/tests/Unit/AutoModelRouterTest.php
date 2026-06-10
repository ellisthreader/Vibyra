<?php

namespace Tests\Unit;

use App\Services\AutoModelRouter;
use App\Services\Billing\CreditCalculator;
use Tests\TestCase;

class AutoModelRouterTest extends TestCase
{
    public function test_routes_prompts_to_research_backed_model_specialties(): void
    {
        $router = app(AutoModelRouter::class);
        $calculator = app(CreditCalculator::class);

        $this->assertSame(
            'google/gemini-3.1-pro-preview',
            $router->route('Build a responsive 3D frontend with polished CSS animations.', 'starter', $calculator)['modelKey']
        );
        $this->assertSame(
            'anthropic/claude-sonnet-4.6',
            $router->route('Refactor this entire codebase across many files.', 'starter', $calculator)['modelKey']
        );
        $this->assertSame(
            'anthropic/claude-opus-4.8',
            $router->route('Perform a security review and find the root cause of this production incident.', 'starter', $calculator)['modelKey']
        );
        $this->assertSame(
            'openai/gpt-5.5',
            $router->route('Implement the API, database migration, and tests.', 'starter', $calculator)['modelKey']
        );
        $this->assertSame(
            'google/gemini-3.5-flash',
            $router->route('Summarize this short paragraph.', 'starter', $calculator)['modelKey']
        );
    }

    public function test_falls_back_to_a_plan_allowed_fast_model(): void
    {
        $calculator = app(CreditCalculator::class);
        $route = app(AutoModelRouter::class)->route(
            'Perform a security review of this architecture.',
            'free',
            $calculator
        );

        $this->assertSame('gpt-5.4-mini', $route['modelKey']);
        $this->assertSame('anthropic/claude-opus-4.8', $route['preferredModelKey']);
        $this->assertLessThanOrEqual(
            config('billing.plans.free.burst_credit_cap'),
            $calculator->estimateCredits(
                $route['modelKey'],
                config('billing.plans.free.context_token_cap'),
                2000,
                true
            )
        );
    }

    public function test_free_plan_fast_general_route_uses_the_affordable_budget_model(): void
    {
        $route = app(AutoModelRouter::class)->route(
            'Write me a poem.',
            'free',
            app(CreditCalculator::class)
        );

        $this->assertSame('fast_general', $route['category']);
        $this->assertSame('gpt-5.4-mini', $route['modelKey']);
        $this->assertSame('google/gemini-3.5-flash', $route['preferredModelKey']);
    }

    public function test_terminal_route_is_constrained_to_native_ready_providers(): void
    {
        $route = app(AutoModelRouter::class)->route(
            'Build a responsive frontend from this screenshot.',
            'starter',
            app(CreditCalculator::class),
            ['openai'],
        );

        $this->assertSame('openai/gpt-5.5', $route['modelKey']);
        $this->assertSame('google/gemini-3.1-pro-preview', $route['preferredModelKey']);
        $this->assertSame(['openai'], $route['allowedProviders']);
    }
}
