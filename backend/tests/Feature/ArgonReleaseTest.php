<?php

namespace Tests\Feature;

use App\Services\Billing\CreditCalculator;
use App\Services\Billing\OpenRouterPricingNormalizer;
use App\Services\Vibes\Auto\Candidates;
use App\Services\Vibes\Auto\Router;
use App\Services\Vibes\Auto\Situation;
use App\Services\Vibes\Catalog;
use App\Services\Vibes\TerminalCatalog;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class ArgonReleaseTest extends TestCase
{
    private const ID = 'google/gemini-4-argon';

    protected function setUp(): void
    {
        parent::setUp();
        // The general suite deliberately opens the terminal menu to every model.
        // Exercise this release's real production default instead.
        unset($_ENV['VIBES_TERMINAL_MODELS'], $_SERVER['VIBES_TERMINAL_MODELS']);
        putenv('VIBES_TERMINAL_MODELS');
        config(['vibes.terminal_models' => (require config_path('vibes.php'))['terminal_models']]);
        $_ENV['VIBES_TERMINAL_MODELS'] = $_SERVER['VIBES_TERMINAL_MODELS'] = '';
        putenv('VIBES_TERMINAL_MODELS=');
        $raw = file_get_contents(__DIR__.'/../Fixtures/argon-openrouter-20261013.json');
        $models = app(OpenRouterPricingNormalizer::class)->fromResponse(
            new Response(new \GuzzleHttp\Psr7\Response(200, [], $raw)));
        Cache::put(config('billing.openrouter_pricing.cache_key'),
            ['synced_at' => now()->toIso8601String(), 'models' => $models]);
    }

    public function test_live_metadata_reaches_paid_catalog_terminal_and_legacy_billing(): void
    {
        $catalog = app(Catalog::class);
        $this->assertSame(['low', 'medium', 'high'], $catalog->efforts(self::ID));
        $this->assertSame('medium', $catalog->defaultEffort(self::ID));
        $this->assertFalse($catalog->includedFree(self::ID));
        $this->assertSame(['effort' => 'high'], $catalog->reasoningRequest(self::ID, 'high'));
        $terminal = app(TerminalCatalog::class)->candidates([self::ID, 'google/gemini-3.1-pro-preview']);
        $this->assertSame([self::ID], array_column($terminal, 'id'));
        $this->assertSame(['low', 'medium', 'high'], $terminal[0]['efforts']);
        $this->assertSame(self::ID, app(CreditCalculator::class)->resolveSlug(self::ID));
        $this->assertEqualsWithDelta(0.012, app(CreditCalculator::class)->estimateUsd(self::ID, 1000, 1000, false), 0.000001);
    }

    public function test_auto_admits_argon_only_when_funded_and_within_its_real_context(): void
    {
        $candidates = app(Candidates::class);
        $paid = $candidates->for(Situation::of(1200, 50, false, true, 0, 0, true));
        $this->assertContains(self::ID, array_column($paid, 'id'));
        $trial = $candidates->for(Situation::of(1200, 50, true, true, 0, 0));
        $this->assertNotContains(self::ID, array_column($trial, 'id'));
        $tooLong = $candidates->for(Situation::of(1048576, 50, false, true, 0, 0));
        $this->assertNotContains(self::ID, array_column($tooLong, 'id'));
    }

    public function test_real_shortlist_keeps_auto_choices_funded_and_with_published_efforts(): void
    {
        $prompts = ['What is git?', 'Fix this race condition and prove correctness under partition.',
            'Review the architecture of this entire repository and design a migration plan.'];
        $catalog = app(Catalog::class);
        foreach ([true, false] as $trial) foreach ([1, 3, 20, 50] as $budget) foreach ($prompts as $prompt) {
            $decision = app(Router::class)->route($prompt, Situation::of(1200, $budget, $trial, true, 0, 0));
            $this->assertLessThanOrEqual($budget, $decision->credits);
            $this->assertContains($decision->model, config('vibes_auto.models'));
            if ($decision->effort !== null) $this->assertContains($decision->effort, $catalog->efforts($decision->model));
            if ($trial) $this->assertTrue($catalog->includedFree($decision->model));
        }
    }
}
