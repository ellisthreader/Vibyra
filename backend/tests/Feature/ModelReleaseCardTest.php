<?php

namespace Tests\Feature;

use App\Services\ModelReleaseBenchmarks;
use App\Services\ModelReleaseCard;
use Illuminate\Http\Client\Factory;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ModelReleaseCardTest extends TestCase
{
    private function board(array $ids): void
    {
        Cache::flush();
        Http::preventStrayRequests();
        Http::fake(['https://openrouter.ai/api/v1/models*' => Http::response([
            'data' => array_map(fn ($id) => ['id' => $id], $ids), 'total_count' => count($ids),
        ])]);
    }

    public function test_card_uses_live_specs_and_a_deduplicated_benchmark_position(): void
    {
        $this->board(['anthropic/opus-test', 'anthropic/opus-test:batch', 'example/coder-27b']);
        $card = app(ModelReleaseCard::class)->build('example/coder-27b', [
            'name' => 'Example Coder 27B', 'description' => 'Writes useful code.',
            'architecture' => ['input_modalities' => ['text', 'image'], 'output_modalities' => ['text']],
            'context_length' => 128000, 'top_provider' => ['max_completion_tokens' => 16000],
            'pricing' => ['prompt' => '0.000001', 'completion' => '0.000003'],
            'supported_parameters' => ['tools', 'reasoning_effort'],
        ]);
        $fields = array_column($card['fields'], 'value', 'name');
        $this->assertSame('Coding', $fields['Type']);
        $this->assertStringContainsString('#2 / 2', $fields['Ranking']);
        $this->assertStringContainsString('95/100', $fields['Importance (estimate)']);
        $this->assertStringContainsString('27B (name-reported', $fields['At a glance']);
        $this->assertStringContainsString('128,000 tokens', $fields['At a glance']);
        $this->assertStringContainsString('Output $3/1M tokens', $fields['At a glance']);
        $this->assertCount(4, $card['fields']);
        $this->assertArrayNotHasKey('Supported controls', $fields);
        $this->assertArrayNotHasKey('Input → output', $fields);
        Http::assertSent(fn ($request) => $request['sort'] === 'coding-high-to-low'
            && $request['min_coding_index'] === 0);
    }

    public function test_categories_distinguish_generation_from_understanding(): void
    {
        $service = app(ModelReleaseCard::class);
        foreach (['image' => 'Image generation', 'video' => 'Video generation',
            'audio' => 'Audio generation', 'speech' => 'Speech generation',
            'transcription' => 'Transcription', 'embeddings' => 'Embeddings'] as $modality => $category) {
            $this->assertSame($category, $service->category('lab/model', [
                'architecture' => ['output_modalities' => [$modality]],
            ]));
        }
        $this->assertSame('General AI', $service->category('lab/vision', [
            'architecture' => ['input_modalities' => ['image'], 'output_modalities' => ['text']],
        ]));
        $this->assertSame('Audio understanding', $service->category('lab/listen', [
            'architecture' => ['input_modalities' => ['audio'], 'output_modalities' => ['text']],
        ]));
        $this->assertSame('Transcription', $service->category('lab/whisper', []));
    }

    public function test_missing_metadata_is_explicit_and_never_invents_specs_or_ranks(): void
    {
        Http::preventStrayRequests();
        $card = app(ModelReleaseCard::class)->build('small-lab/new', ['name' => 'New']);
        $fields = array_column($card['fields'], 'value', 'name');
        $this->assertStringContainsString('35/100', $fields['Importance (estimate)']);
        $this->assertSame('Not ranked for this type', $fields['Ranking']);
        $this->assertCount(3, $card['fields']);
        Http::assertNothingSent();
    }

    public function test_unscored_outside_top_100_and_failed_benchmarks_are_distinct(): void
    {
        $ids = array_map(fn ($n) => 'lab/model-'.$n, range(1, 101));
        $this->board($ids);
        $service = app(ModelReleaseBenchmarks::class);
        $this->assertStringContainsString('Outside top 100 (#101 of 101)', $service->lookup('lab/model-101', 'General AI')['text']);
        $this->assertNull($service->lookup('lab/new', 'General AI')['rank']);
        $this->assertStringContainsString('Not yet benchmarked', $service->lookup('lab/new', 'General AI')['text']);
        Http::assertSentCount(1);
        Cache::flush();
        Http::swap(new Factory);
        Http::fake(['*' => Http::response([], 503)]);
        $this->assertSame('Benchmark temporarily unavailable.', $service->lookup('lab/new', 'General AI')['text']);
    }

    public function test_media_card_keeps_price_units_and_bounds_untrusted_text(): void
    {
        Http::preventStrayRequests();
        $card = app(ModelReleaseCard::class)->build('google/image-test', [
            'name' => 'Image Test', 'description' => str_repeat('Long [link](https://example.test) <b>description</b>. ', 400),
            'architecture' => ['input_modalities' => ['text', 'image'], 'output_modalities' => ['image']],
            'pricing' => ['prompt' => '0', 'completion' => '0.00003'],
        ]);
        $fields = array_column($card['fields'], 'value', 'name');
        $this->assertSame('Image generation', $fields['Type']);
        $this->assertStringContainsString('Media pricing: see model page', $fields['At a glance']);
        $this->assertLessThanOrEqual(160, mb_strlen($card['description']));
        $this->assertStringNotContainsString('https://example.test', $card['description']);
        Http::assertNothingSent();
    }
}
