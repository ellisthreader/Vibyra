<?php

namespace Tests\Feature;

use App\Services\Billing\OpenRouterPricingCatalog;
use App\Services\Vibes\Auto\Candidates;
use App\Services\Vibes\Auto\Profiles;
use App\Services\Vibes\Auto\Router;
use App\Services\Vibes\Auto\RoutingPrompt;
use App\Services\Vibes\Auto\Situation;
use App\Services\Vibes\Catalog;
use App\Services\Vibes\TurnPrice;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\Support\VibesCatalogue;
use Tests\TestCase;

class VibesAutoGuardrailsTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        VibesCatalogue::put();
    }

    private function snapshot(array $rows): void
    {
        Cache::put(config('billing.openrouter_pricing.cache_key'), ['synced_at' => now()->toIso8601String(), 'models' => $rows]);
    }

    public function test_current_shortlist_matches_mobile_and_every_candidate_has_a_reviewed_profile(): void
    {
        $source = file_get_contents(base_path('../mobile/src/ui/pickerModels.ts'));
        preg_match('/new Set\(\[(.*?)\]\)/s', $source, $list);
        preg_match_all("/'([^']+)'/", $list[1], $ids);
        $this->assertSame($ids[1], config('vibes_auto.models'));
        foreach ($ids[1] as $id) $this->assertTrue(Profiles::known($id), $id);
        $choices = app(Router::class)->ranked('hello', Situation::of(1200, 50, false, false, 0, 0));
        foreach ($choices as $row) $this->assertContains($row['id'], $ids[1]);
    }

    public function test_a_decision_reads_one_snapshot_even_with_tools_vision_and_trial_constraints(): void
    {
        $snapshot = VibesCatalogue::models();
        foreach ($snapshot as &$row) $row['input_modalities'] = ['text', 'image'];
        unset($row);
        $pricing = \Mockery::mock(OpenRouterPricingCatalog::class);
        $pricing->shouldReceive('all')->once()->andReturn($snapshot);
        $rows = (new Candidates(app(Catalog::class), $pricing))->for(Situation::of(1200, 3, true, true, 0, 0, true));
        $this->assertNotEmpty($rows);
    }

    public function test_no_vision_candidate_does_not_fall_back_to_a_blind_model(): void
    {
        $this->expectException(HttpException::class);
        $this->expectExceptionMessage('No suitable Auto model');
        app(Router::class)->route('Review this screenshot', Situation::of(1200, 50, false, false, 0, 0, true));
    }

    public function test_no_tools_candidate_does_not_fall_back_to_a_chat_only_model(): void
    {
        $rows = VibesCatalogue::models();
        foreach ($rows as &$row) $row['supported_parameters'] = [];
        unset($row);
        $this->snapshot($rows);
        $this->expectException(HttpException::class);
        app(Router::class)->route('Edit the project', Situation::of(1200, 50, false, true, 0, 0));
    }

    public function test_context_limit_includes_output_and_can_lower_effort_to_fit(): void
    {
        $id = 'openai/gpt-5.6-luna';
        $row = VibesCatalogue::models()[$id];
        $row['context_length'] = 1200 + TurnPrice::outputTokens('none');
        $this->snapshot([$id => $row]);
        $decision = app(Router::class)->route('Prove this distributed consensus algorithm correct under partition', Situation::of(1200, 50, false, false, 0, 0));
        $this->assertSame('none', $decision->effort);
        $this->assertTrue($decision->constrained);
        $row['context_length']--;
        $this->snapshot([$id => $row]);
        $this->expectException(HttpException::class);
        app(Router::class)->route('hello', Situation::of(1200, 50, false, false, 0, 0));
    }

    public function test_trial_credit_does_not_make_a_paid_only_model_affordable(): void
    {
        $situation = Situation::of(1200, 50, false, false, 0, 0, paidBudget: 1);
        $decision = app(Router::class)->route('Design a distributed rate limiter and prove correctness under partition.', $situation);
        $trial = app(Catalog::class)->includedFree($decision->model);
        $this->assertLessThanOrEqual($trial ? 50 : 1, $decision->credits);
    }

    public function test_negative_or_non_numeric_prices_cannot_win_as_a_cheap_model(): void
    {
        $id = 'qwen/qwen3.8-flash';
        foreach (['-0.1', 'unknown', INF] as $bad) {
            $row = VibesCatalogue::models()[$id];
            $row['pricing']['completion'] = $bad;
            $this->snapshot([$id => $row]);
            $this->assertSame([], app(Router::class)->ranked('hi', Situation::of(1200, 3, true, false, 0, 0)));
        }
    }
    public function test_continue_keeps_the_previous_task_but_a_new_request_stands_alone(): void
    {
        $task = 'Design a distributed rate limiter and prove correctness under partition.';
        $messages = [['role' => 'user', 'content' => $task], ['role' => 'assistant', 'content' => 'Use a cheap model'],
            ['role' => 'user', 'content' => 'yes'], ['role' => 'assistant', 'content' => 'Plan'],
            ['role' => 'user', 'content' => 'yes, continue']];
        $s = Situation::of(1200, 50, false, false, 0, 0);
        $router = app(Router::class);
        $continued = RoutingPrompt::from('yes, continue', $messages);
        $this->assertStringContainsString($task, $continued);
        $this->assertSame($router->route($task, $s)->model, $router->route($continued, $s)->model);
        $this->assertSame('What is git?', RoutingPrompt::from('What is git?', $messages));
        $this->assertStringNotContainsString('cheap model', $continued);
    }

}
