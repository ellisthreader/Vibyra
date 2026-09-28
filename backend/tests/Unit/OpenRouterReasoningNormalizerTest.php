<?php

namespace Tests\Unit;

use App\Services\Billing\OpenRouterPricingNormalizer;
use Illuminate\Http\Client\Response;
use Tests\TestCase;

/**
 * The reasoning ladder the phone's effort selector is built from. Three shapes
 * exist in the live OpenRouter catalogue and they carry different facts, so the
 * normalizer must keep them apart rather than flatten them into one.
 */
class OpenRouterReasoningNormalizerTest extends TestCase
{
    private function normalize(array $model): ?array
    {
        $body = json_encode(['data' => [$model + [
            'id' => 'vendor/model',
            'pricing' => ['prompt' => '0.000001', 'completion' => '0.000002'],
        ]]]);
        $response = new Response(new \GuzzleHttp\Psr7\Response(200, [], $body));

        return app(OpenRouterPricingNormalizer::class)->fromResponse($response)['vendor/model'];
    }

    public function test_published_ladder_is_stored_ascending(): void
    {
        // Anthropic reports highest-first; every reader wants cheapest-first.
        $model = $this->normalize(['reasoning' => [
            'mandatory' => true,
            'default_effort' => 'high',
            'supported_efforts' => ['max', 'xhigh', 'high', 'medium', 'low'],
        ]]);

        $this->assertSame(['low', 'medium', 'high', 'xhigh', 'max'], $model['reasoning']['supported_efforts']);
        $this->assertSame('high', $model['reasoning']['default_effort']);
        $this->assertTrue($model['reasoning']['mandatory']);
    }

    public function test_absent_supported_efforts_key_is_preserved_as_absent(): void
    {
        // A switch, not a dial: 143 live models look exactly like this.
        $model = $this->normalize(['reasoning' => ['mandatory' => false, 'default_enabled' => true]]);

        $this->assertIsArray($model['reasoning']);
        $this->assertArrayNotHasKey('supported_efforts', $model['reasoning']);
        $this->assertFalse($model['reasoning']['mandatory']);
    }

    public function test_explicit_null_means_every_level_and_is_kept_distinct(): void
    {
        $model = $this->normalize(['reasoning' => ['supported_efforts' => null]]);

        $this->assertArrayHasKey('supported_efforts', $model['reasoning']);
        $this->assertNull($model['reasoning']['supported_efforts']);
    }

    public function test_unknown_efforts_and_defaults_are_discarded(): void
    {
        // 'ultracode' is a Vibyra desktop CLI mode. OpenRouter would reject it.
        $model = $this->normalize(['reasoning' => [
            'supported_efforts' => ['high', 'ultracode', 7, 'low', 'high'],
            'default_effort' => 'ultracode',
        ]]);

        $this->assertSame(['low', 'high'], $model['reasoning']['supported_efforts']);
        $this->assertArrayNotHasKey('default_effort', $model['reasoning']);
    }

    public function test_a_model_without_reasoning_reports_none(): void
    {
        $this->assertNull($this->normalize([])['reasoning']);
        $this->assertNull($this->normalize(['reasoning' => 'nonsense'])['reasoning']);
    }

    public function test_catalogue_metadata_for_the_picker_is_captured(): void
    {
        $model = $this->normalize([
            'created' => 1_757_000_000,
            'context_length' => 400_000,
            'architecture' => ['output_modalities' => ['Text']],
        ]);

        $this->assertSame(1_757_000_000, $model['created']);
        $this->assertSame(400_000, $model['context_length']);
        $this->assertSame(['text'], $model['output_modalities']);
    }

    public function test_missing_or_invalid_metadata_does_not_break_a_model(): void
    {
        $model = $this->normalize(['created' => 'soon', 'context_length' => -5, 'architecture' => 'nonsense']);

        $this->assertNull($model['created']);
        $this->assertNull($model['context_length']);
        $this->assertNull($model['output_modalities']);
        $this->assertSame('vendor/model', $model['slug']);
    }

    public function test_context_length_falls_back_to_the_top_provider(): void
    {
        $model = $this->normalize(['top_provider' => ['context_length' => 128_000]]);

        $this->assertSame(128_000, $model['context_length']);
    }
}
