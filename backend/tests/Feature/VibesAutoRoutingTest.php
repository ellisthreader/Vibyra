<?php

namespace Tests\Feature;

use App\Services\Vibes\Auto\Router;
use App\Services\Vibes\Auto\Situation;
use App\Services\Vibes\Catalog;
use App\Services\Vibes\TurnPrice;
use Illuminate\Support\Facades\Cache;
use Tests\Support\VibesCatalogue;
use Tests\TestCase;

/**
 * What Auto is allowed to choose, as opposed to what it would prefer. Every rule
 * here is one a person would meet as an error if the router broke it: a 402 for a
 * model their credit cannot fund, a 503 for one the provider withdrew, a 422 for a
 * turn priced past the ceiling or a model that cannot call the project tools.
 */
class VibesAutoRoutingTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['vibes.enabled' => true, 'services.openrouter.key' => 'test-only']);
        VibesCatalogue::put();
    }

    private function router(): Router
    {
        return app(Router::class);
    }

    private function situation(int $budget = 50, bool $trialOnly = false, bool $needsTools = false, int $inputBound = 1200): Situation
    {
        return Situation::of($inputBound, $budget, $trialOnly, $needsTools, 0, 0);
    }

    public function test_a_hard_turn_reaches_for_a_stronger_model_than_an_easy_one(): void
    {
        $easy = $this->router()->route('what is the git command to undo the last commit?', $this->situation());
        $hard = $this->router()->route('design a distributed rate limiter that stays correct when a node '
            .'dies mid-window, and prove the invariant holds under partition', $this->situation());

        $this->assertGreaterThan($easy->credits, $hard->credits, 'the hard turn is worth spending on');
        $this->assertNotSame($easy->model, $hard->model);
    }

    /**
     * The two curated ids OpenRouter does not serve. They are filtered on the absence
     * of a live price rather than by name, so a model coming back tomorrow needs no
     * code change and one withdrawn tomorrow needs no list updating.
     */
    public function test_a_model_the_provider_does_not_serve_is_never_chosen(): void
    {
        foreach ($this->everyChoice() as $model) {
            $this->assertNotContains($model, VibesCatalogue::UNSERVED);
        }
    }

    /** A model the picker refuses to show is not one Auto may pick on someone's behalf. */
    public function test_a_model_hidden_from_the_picker_is_never_chosen(): void
    {
        $catalog = app(Catalog::class);
        foreach ($this->everyChoice() as $model) {
            $this->assertFalse($catalog->hidden($model, app(\App\Services\Billing\OpenRouterPricingCatalog::class)->all()[$model] ?? null),
                $model.' is hidden from the picker');
        }
    }

    /** Trial credit can only buy a trial-funded model, so Auto must not offer another. */
    public function test_an_account_with_no_purchased_vibes_only_gets_funded_models(): void
    {
        $catalog = app(Catalog::class);
        foreach ($this->everyChoice(trialOnly: true) as $model) {
            $this->assertTrue($catalog->includedFree($model), $model.' cannot be funded by trial credit');
        }
    }

    public function test_a_bound_project_only_gets_models_that_can_call_tools(): void
    {
        $pricing = app(\App\Services\Billing\OpenRouterPricingCatalog::class);
        foreach ($this->everyChoice(needsTools: true) as $model) {
            $this->assertTrue($pricing->supportsTerminalToolCalling($model), $model.' cannot call tools');
        }
    }

    /**
     * The guarantee that matters most in practice: whatever Auto returns, the quote
     * that follows must be sendable. A router that proposed a turn the ceiling then
     * refused would be worse than the constant it replaced.
     */
    public function test_every_choice_is_priced_inside_the_budget_it_was_given(): void
    {
        foreach ([1, 3, 8, 20, 50] as $budget) {
            foreach ($this->prompts() as $prompt) {
                $decision = $this->router()->route($prompt, $this->situation(budget: $budget));
                $this->assertLessThanOrEqual($budget, $decision->credits,
                    'budget '.$budget.' exceeded by '.$decision->model.' on: '.$prompt);
            }
        }
    }

    /** Effort is stepped down before the model is given up on. */
    public function test_a_tight_budget_lowers_the_effort_before_it_lowers_the_model(): void
    {
        $prompt = 'we have a race condition in the settlement path. find the root cause and prove the fix.';
        $generous = $this->router()->route($prompt, $this->situation(budget: 50));
        $tight = $this->router()->route($prompt, $this->situation(budget: 2));

        $this->assertNotNull($generous->effort, 'a hard turn on a generous budget should be steered');
        $this->assertLessThanOrEqual(2, $tight->credits);
        $this->assertTrue($tight->constrained, 'the tight turn knows it was stepped back');
    }

    /** An empty catalogue is a 503 from `Catalog::resolve`, not a crash in the router. */
    public function test_an_empty_snapshot_falls_back_to_the_configured_model(): void
    {
        Cache::forget((string) config('billing.openrouter_pricing.cache_key'));
        $decision = $this->router()->route('anything at all', $this->situation());

        $this->assertSame(config('vibes.auto_model'), $decision->model);
    }

    /** The same prompt and the same situation must always give the same answer. */
    public function test_routing_is_deterministic(): void
    {
        foreach ($this->prompts() as $prompt) {
            $first = $this->router()->route($prompt, $this->situation());
            $second = $this->router()->route($prompt, $this->situation());
            $this->assertSame($first->model, $second->model);
            $this->assertSame($first->effort, $second->effort);
        }
    }

    /** It runs on every pause in typing, so it has to stay a cheap local computation. */
    public function test_routing_a_long_prompt_stays_fast(): void
    {
        $prompt = str_repeat('refactor the settlement module and explain the race condition. ', 60);
        $started = hrtime(true);
        for ($i = 0; $i < 50; $i++) $this->router()->route($prompt, $this->situation());
        $perCall = (hrtime(true) - $started) / 50 / 1_000_000;

        $this->assertLessThan(20.0, $perCall, 'routing took '.round($perCall, 2).'ms per call');
    }

    /** An effort the chosen model never published is one OpenRouter would reject. */
    public function test_the_chosen_effort_is_always_one_the_chosen_model_publishes(): void
    {
        $catalog = app(Catalog::class);
        foreach ($this->prompts() as $prompt) {
            $decision = $this->router()->route($prompt, $this->situation());
            $efforts = $catalog->efforts($decision->model);
            if ($decision->effort === null) {
                $this->assertSame([], $efforts, $decision->model.' has a ladder but was sent no effort');
                continue;
            }
            $this->assertContains($decision->effort, $efforts, $decision->model.' cannot take '.$decision->effort);
        }
    }

    /**
     * A documented blind spot rather than a fix. An arithmetic word problem carries
     * no phrase that marks it as one, and the router reads it as the small question
     * it looks like. It is left alone deliberately: a composer for building software
     * does not see these often enough to be worth a detector that would misfire on
     * every prompt that happens to contain two numbers.
     */
    public function test_an_unmarked_word_problem_is_a_known_blind_spot(): void
    {
        $demand = $this->router()->demand(
            'three people pay 30 for a room, the clerk returns 5, where did the missing pound go?',
            $this->situation(),
        );

        $this->assertLessThan(0.38, $demand->deliberation, 'if this now passes, the corpus label can be restored');
    }

    /** @return list<string> */
    private function everyChoice(bool $trialOnly = false, bool $needsTools = false): array
    {
        $chosen = [];
        foreach ($this->prompts() as $prompt) {
            foreach ([1, 6, 50] as $budget) {
                $chosen[] = $this->router()->route($prompt, $this->situation($budget, $trialOnly, $needsTools))->model;
            }
        }

        return array_values(array_unique($chosen));
    }

    /** @return list<string> */
    private function prompts(): array
    {
        return array_column(\Tests\Support\AutoRoutingCorpus::all(), 'prompt');
    }
}
