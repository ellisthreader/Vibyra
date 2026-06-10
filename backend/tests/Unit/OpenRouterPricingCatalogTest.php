<?php

namespace Tests\Unit;

use App\Services\Billing\OpenRouterPricingCatalog;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Tests\TestCase;

class OpenRouterPricingCatalogTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Cache::flush();
        Http::preventStrayRequests();
        config()->set([
            'services.openrouter.key' => 'test-key',
            'billing.openrouter_pricing' => [
                'cache_key' => 'test.openrouter.pricing',
                'ttl_seconds' => 60,
                'max_stale_seconds' => 3600,
                'timeout_seconds' => 5,
                'sync_url' => 'https://openrouter.ai/api/v1/models/user',
                'fallback_sync_url' => 'https://openrouter.ai/api/v1/models?output_modalities=all',
            ],
        ]);
    }

    public function test_syncs_user_catalog_and_preserves_raw_price_strings(): void
    {
        Http::fake([
            'https://openrouter.ai/api/v1/models/user' => Http::response([
                'data' => [
                    $this->model('openai/gpt-test', [
                        'prompt' => '0.00000120',
                        'completion' => '2e-6',
                        'request' => '0',
                    ]),
                ],
            ]),
        ]);

        $catalog = app(OpenRouterPricingCatalog::class);
        $snapshot = $catalog->sync();

        $this->assertCount(1, $snapshot['models']);
        $this->assertSame('0.00000120', $catalog->pricingFor('openai/gpt-test')['prompt']);
        $this->assertSame('2e-6', $catalog->modelPricing('openai/gpt-test')['completion']);
        $this->assertFalse($catalog->isStale());
        $this->assertSame(1, $catalog->status()['count']);
        $this->assertTrue(Cache::has('test.openrouter.pricing'));
        Http::assertSent(fn ($request) => $request->url() === 'https://openrouter.ai/api/v1/models/user'
            && $request->hasHeader('Authorization', 'Bearer test-key'));
    }

    public function test_falls_back_to_all_models_when_user_catalog_fails(): void
    {
        Http::fake(function ($request) {
            if ($request->url() === 'https://openrouter.ai/api/v1/models/user') {
                return Http::response(['error' => ['message' => 'Unauthorized']], 401);
            }

            return Http::response([
                'data' => [$this->model('anthropic/claude-test', ['prompt' => '0.000003'])],
            ]);
        });

        $catalog = app(OpenRouterPricingCatalog::class);
        $catalog->sync();

        $this->assertSame('0.000003', $catalog->pricingFor('anthropic/claude-test')['prompt']);
        Http::assertSent(fn ($request) => $request->url()
            === 'https://openrouter.ai/api/v1/models?output_modalities=all');
    }

    public function test_rejects_float_prices_without_discarding_valid_string_prices(): void
    {
        Http::fake([
            'https://openrouter.ai/api/v1/models/user' => Http::response([
                'data' => [
                    $this->model('google/gemini-test', [
                        'prompt' => 0.000001,
                        'completion' => '0.000002',
                        'invalid' => 'not-a-price',
                    ]),
                ],
            ]),
        ]);

        $pricing = app(OpenRouterPricingCatalog::class)->sync()['models']['google/gemini-test']['pricing'];

        $this->assertSame(['completion' => '0.000002'], $pricing);
        $this->assertIsString($pricing['completion']);
    }

    public function test_preserves_capabilities_and_terminal_tool_check_fails_closed(): void
    {
        Http::fake([
            'https://openrouter.ai/api/v1/models/user' => Http::response([
                'data' => [
                    $this->model('openai/tool-model', ['prompt' => '0.000001'], [' Tools ', 'reasoning', 'tools']),
                    $this->model('openai/chat-only', ['prompt' => '0.000001'], ['reasoning']),
                    $this->model('openai/unknown-capabilities', ['prompt' => '0.000001']),
                ],
            ]),
        ]);

        $catalog = app(OpenRouterPricingCatalog::class);
        $models = $catalog->sync()['models'];

        $this->assertSame(['reasoning', 'tools'], $models['openai/tool-model']['supported_parameters']);
        $this->assertTrue($catalog->supportsTerminalToolCalling('openai/tool-model'));
        $this->assertFalse($catalog->supportsTerminalToolCalling('openai/chat-only'));
        $this->assertFalse($catalog->supportsTerminalToolCalling('openai/unknown-capabilities'));
        $this->assertFalse($catalog->supportsTerminalToolCalling('openai/missing'));
    }

    public function test_refreshes_an_empty_catalog_for_a_selected_terminal_model(): void
    {
        Http::fake([
            'https://openrouter.ai/api/v1/models/user' => Http::response([
                'data' => [
                    $this->model(
                        'deepseek/deepseek-v4-flash',
                        ['prompt' => '0.0000001', 'completion' => '0.0000004'],
                        ['tools', 'reasoning'],
                    ),
                ],
            ]),
        ]);

        $catalog = app(OpenRouterPricingCatalog::class);

        $this->assertSame(
            '0.0000001',
            $catalog->refreshPricingFor('deepseek/deepseek-v4-flash')['prompt'] ?? null,
        );
        $this->assertTrue($catalog->supportsTerminalToolCalling('deepseek/deepseek-v4-flash'));
        $this->assertSame(1, $catalog->status()['count']);
        Http::assertSentCount(1);
    }

    public function test_missing_terminal_models_are_negatively_cached_after_one_refresh(): void
    {
        Http::fake([
            'https://openrouter.ai/api/v1/models/user' => Http::response([
                'data' => [
                    $this->model('openai/known', ['prompt' => '0.000001'], ['tools']),
                ],
            ]),
        ]);

        $catalog = app(OpenRouterPricingCatalog::class);

        $this->assertNull($catalog->refreshPricingFor('unknown/not-real'));
        $this->assertNull($catalog->refreshPricingFor('unknown/not-real'));
        Http::assertSentCount(1);
    }

    public function test_failed_sync_preserves_last_known_good_snapshot_and_reports_staleness(): void
    {
        $available = true;
        Http::fake(function () use (&$available) {
            return $available
                ? Http::response([
                    'data' => [$this->model('openai/gpt-test', ['prompt' => '0.000001'])],
                ])
                : Http::response(['error' => 'Unavailable'], 503);
        });

        $catalog = app(OpenRouterPricingCatalog::class);
        $snapshot = $catalog->sync();
        $snapshot['synced_at'] = now()->subSeconds(61)->toIso8601String();
        Cache::forever('test.openrouter.pricing', $snapshot);
        $available = false;

        $thrown = false;
        try {
            $catalog->sync();
        } catch (RuntimeException) {
            $thrown = true;
        }

        $this->assertTrue($thrown);
        $this->assertSame('0.000001', $catalog->pricingFor('openai/gpt-test')['prompt']);
        $this->assertTrue($catalog->isStale());
        $this->assertNull($catalog->freshPricingFor('openai/gpt-test'));
    }

    public function test_command_syncs_and_reports_model_count(): void
    {
        Http::fake([
            'https://openrouter.ai/api/v1/models/user' => Http::response([
                'data' => [
                    $this->model('openai/one', ['prompt' => '0.1']),
                    $this->model('openai/two', ['prompt' => '0.2']),
                ],
            ]),
        ]);

        $this->artisan('vibyra:sync-openrouter-pricing')
            ->expectsOutput('Synced 2 OpenRouter model(s).')
            ->assertSuccessful();
    }

    private function model(string $slug, array $pricing, ?array $supportedParameters = null): array
    {
        $model = [
            'id' => $slug,
            'canonical_slug' => $slug,
            'name' => $slug,
            'pricing' => $pricing,
        ];
        if ($supportedParameters !== null) {
            $model['supported_parameters'] = $supportedParameters;
        }

        return $model;
    }
}
