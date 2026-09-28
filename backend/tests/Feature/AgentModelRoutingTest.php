<?php

namespace Tests\Feature;

use App\Services\Agents\ModelRouter;
use App\Services\Vibes\Auto\Situation;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\Support\VibesCatalogue;
use Tests\TestCase;

class AgentModelRoutingTest extends TestCase
{
    private const SONNET = 'anthropic/claude-sonnet-5';
    private const OPUS = 'anthropic/claude-opus-5';
    private const FLASH = 'google/gemini-3.8-flash';
    private const HARD = 'Find the root cause of a race condition in payment settlement, prove correctness and design an idempotent distributed protocol.';

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        VibesCatalogue::put();
    }

    private function route(string $text = 'Review the project and draft an implementation plan.', int $budget = 50,
        int $input = 1000, bool $tools = false, bool $trial = false, ?int $paid = null, string $brief = '', bool $vision = false)
    {
        return app(ModelRouter::class)->route($text, Situation::of($input, 500, $trial, $tools, 0, 0, $vision, $paid),
            (object) ['budget' => $budget, 'brief' => $brief]);
    }

    public function test_default_complex_and_quick_tasks_choose_the_approved_models(): void
    {
        $this->assertSame(self::SONNET, $this->route()->model);
        $hard = $this->route(self::HARD);
        $this->assertSame(self::OPUS, $hard->model);
        $this->assertSame('high', $hard->effort);
        $this->assertSame(self::FLASH, $this->route('hello')->model);
    }

    public function test_role_is_used_for_an_underspecified_task(): void
    {
        $this->assertSame(self::OPUS, $this->route('Review this.', brief: self::HARD)->model);
    }

    public function test_task_ceiling_wins_over_a_large_wallet_and_keeps_room_for_tools(): void
    {
        $chosen = $this->route(self::HARD, budget: 5, input: 3000, tools: true);
        $this->assertSame(self::FLASH, $chosen->model);
        $this->assertLessThanOrEqual(5, $chosen->credits);
        $this->assertTrue($chosen->constrained);
        $this->assertSame(self::OPUS, $this->route(self::HARD, tools: true)->model);
    }

    public function test_effort_steps_down_before_abandoning_sonnet(): void
    {
        $chosen = $this->route(budget: 5);
        $this->assertSame(self::SONNET, $chosen->model);
        $this->assertSame('low', $chosen->effort);
    }

    public function test_trial_credit_cannot_fund_paid_models_even_with_a_mixed_wallet(): void
    {
        $this->assertSame(self::FLASH, $this->route(self::HARD, trial: true)->model);
        $this->assertSame(self::FLASH, $this->route(self::HARD, paid: 1)->model);
    }

    public function test_missing_tools_and_vision_filter_candidates_before_selection(): void
    {
        $models = VibesCatalogue::models();
        $models[self::SONNET]['supported_parameters'] = ['reasoning'];
        $models[self::FLASH]['input_modalities'] = ['image', 'text'];
        VibesCatalogue::put($models);
        $this->assertSame(self::FLASH, $this->route(tools: true)->model);
        $this->assertSame(self::FLASH, $this->route(vision: true)->model);
    }

    public function test_invalid_or_absent_candidates_never_fall_back_to_an_unapproved_model(): void
    {
        VibesCatalogue::put([self::SONNET => [], self::OPUS => [], self::FLASH => []]);
        $this->expectException(HttpException::class);
        $this->expectExceptionMessage('No suitable Agent model');
        $this->route();
    }

    public function test_unaffordable_context_is_rejected_before_creating_a_quote(): void
    {
        try { $this->route(budget: 1, input: 100000); $this->fail('Expected budget refusal'); }
        catch (HttpException $e) { $this->assertSame(422, $e->getStatusCode()); }
    }

    public function test_context_capacity_includes_the_tool_continuation(): void
    {
        $models = VibesCatalogue::models();
        $models[self::SONNET]['context_length'] = 5000;
        VibesCatalogue::put($models);
        $this->assertSame(self::FLASH, $this->route(tools: true)->model);
    }
}
