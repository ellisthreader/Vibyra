<?php

namespace Tests\Feature;

use App\Services\Billing\OpenRouterPricingCatalog;
use App\Services\Vibes\{Catalog, Plans};
use Mockery;
use Tests\TestCase;

/** Database-backed pricing caches must not be fetched/deserialized for every menu row. */
class VibesCatalogSnapshotTest extends TestCase
{
    public function test_large_model_menu_reads_the_snapshot_once_and_preserves_metadata(): void
    {
        config(['vibes.models' => ['qwen/menu-test' => ['family' => 'Qwen', 'name' => 'Menu test']],
            'vibes.catalogue_limit' => 500]);
        $model = ['pricing' => ['prompt' => '0.0000001', 'completion' => '0.0000002'],
            'reasoning' => ['supported_efforts' => null, 'mandatory' => true, 'default_effort' => 'low'],
            'input_modalities' => ['text', 'image'], 'output_modalities' => ['text'], 'created' => 1700000000];
        $models = ['qwen/menu-test' => $model, 'openai/menu' => $model, 'openai/menu-pro' => $model];
        foreach (range(1, 450) as $i) $models['qwen/model-'.$i] = $model;
        $pricing = Mockery::mock(OpenRouterPricingCatalog::class);
        $pricing->shouldReceive('isStale')->twice()->andReturn(false);
        $pricing->shouldReceive('all')->once()->andReturn($models);
        $rows = (new Catalog($pricing, app(Plans::class)))->models();
        $this->assertCount(452, $rows);
        $this->assertNotContains('openai/menu-pro', array_column($rows, 'id'));
        $this->assertTrue($rows[0]['available']);
        $this->assertTrue($rows[0]['trial']);
        $this->assertTrue($rows[0]['vision']);
        $this->assertEqualsWithDelta(0.1, $rows[0]['inputPerMillion'], 0.000001);
        $this->assertSame(['minimal', 'low', 'medium', 'high', 'xhigh', 'max'], $rows[0]['reasoning']['efforts']);
        $this->assertSame('low', $rows[0]['reasoning']['defaultEffort']);
    }

    public function test_failed_refresh_never_marks_stale_prices_as_available(): void
    {
        config(['vibes.models' => ['qwen/menu-test' => ['family' => 'Qwen', 'name' => 'Menu test']]]);
        $pricing = Mockery::mock(OpenRouterPricingCatalog::class);
        $pricing->shouldReceive('isStale')->twice()->andReturn(true);
        $pricing->shouldReceive('refreshPricingFor')->once()->andReturn(null);
        $pricing->shouldReceive('all')->once()->andReturn(['qwen/menu-test' => [
            'pricing' => ['prompt' => '0.0000001', 'completion' => '0.0000002']]]);
        $rows = (new Catalog($pricing, app(Plans::class)))->models();
        $this->assertFalse($rows[0]['available']);
        $this->assertNull($rows[0]['inputPerMillion']);
    }
}
