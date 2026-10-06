<?php

namespace Tests\Feature;

use App\Services\Billing\OpenRouterPricingCatalog;
use App\Services\Vibes\TerminalCatalog;
use Tests\TestCase;

final class TerminalCandidatesTest extends TestCase
{
    public function test_full_auto_menu_reads_one_snapshot_and_uses_authoritative_efforts(): void
    {
        $models = [];
        for ($i = 0; $i < 64; $i++) {
            $models['vendor/model-'.$i] = ['name' => 'Model '.$i, 'output_modalities' => ['text'],
                'pricing' => ['prompt' => '0.00001', 'completion' => '0.00002'],
                'reasoning' => ['supported_efforts' => ['low', 'high'], 'default_effort' => 'high']];
        }
        $pricing = \Mockery::mock(OpenRouterPricingCatalog::class);
        $pricing->shouldReceive('isStale')->twice()->andReturn(false);
        $pricing->shouldReceive('all')->once()->andReturn($models);
        $catalog = new TerminalCatalog($pricing);
        $rows = $catalog->candidates(array_keys($models));
        $this->assertCount(64, $rows);
        foreach ($rows as $i => $row) {
            $this->assertSame(['id' => 'vendor/model-'.$i, 'name' => 'Model '.$i, 'efforts' => ['low', 'high']], $row);
        }
    }

    public function test_auto_menu_rejects_unavailable_router_image_only_unpriced_and_level_less_candidates(): void
    {
        $valid = ['name' => 'Valid', 'output_modalities' => ['text'], 'pricing' => ['prompt' => '0', 'completion' => '0'],
            'reasoning' => ['supported_efforts' => ['low', 'high']]];
        $models = ['vendor/good' => $valid, 'typesafe/jev-router' => $valid,
            'vendor/image' => [...$valid, 'output_modalities' => ['image']],
            'vendor/unpriced' => [...$valid, 'pricing' => []],
            // Vibyra tokens offers only models whose effort can be chosen.
            'vendor/no-levels' => [...$valid, 'reasoning' => null],
            'vendor/switch' => [...$valid, 'reasoning' => ['supported_efforts' => ['none', 'high']]]];
        $pricing = \Mockery::mock(OpenRouterPricingCatalog::class);
        $pricing->shouldReceive('isStale')->twice()->andReturn(false);
        $pricing->shouldReceive('all')->once()->andReturn($models);
        $rows = (new TerminalCatalog($pricing))->candidates([...array_keys($models), 'vendor/missing']);
        $this->assertSame([['id' => 'vendor/good', 'name' => 'Valid', 'efforts' => ['low', 'high']]], $rows);
    }
}
