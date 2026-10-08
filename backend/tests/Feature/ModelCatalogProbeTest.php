<?php

namespace Tests\Feature;

use App\Services\ModelCatalog\{Policy, Probe};
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ModelCatalogProbeTest extends TestCase
{
    private function model(): array
    {
        return ['id' => 'openai/gpt-99', 'canonicalModel' => 'openai/gpt-99-20261008',
            'pricing' => ['prompt' => '0.000001', 'completion' => '0.000002'],
            'efforts' => ['low', 'high'], 'reasoning' => ['supported_efforts' => ['low', 'high']]];
    }

    private function tool(string $model = 'openai/gpt-99'): array
    {
        return ['id' => 'gen-tool', 'model' => $model, 'choices' => [['message' => ['tool_calls' => [
            ['id' => 'call-1', 'type' => 'function', 'function' => ['name' => 'catalog_echo', 'arguments' => '{"word":"ready"}']],
        ]]]]];
    }

    private function stream(string $model = 'openai/gpt-99', string $id = 'gen-stream'): string
    {
        return 'data: '.json_encode(['id' => $id, 'model' => $model, 'choices' => [[
            'delta' => ['content' => 'ready'], 'finish_reason' => 'stop',
        ]]])."\n\ndata: [DONE]\n";
    }

    public function test_probe_records_exact_model_receipts_for_tool_result_and_each_effort(): void
    {
        Http::fake(['*' => Http::sequence()->push($this->tool())->push($this->stream())->push($this->stream(id: 'gen-high'))]);
        $proof = app(Probe::class)->run($this->model());
        $this->assertSame(['model-receipt', 'tool-call', 'tool-result', 'stream', 'efforts'], $proof['checks']);
        $this->assertSame(['gen-tool', 'gen-stream', 'gen-high'], array_column($proof['receipts'], 'generation'));
        $this->assertSame(['openai/gpt-99'], array_unique(array_column($proof['receipts'], 'model')));
        Http::assertSentCount(3);
        Http::assertSent(fn ($r) => ($r['reasoning']['effort'] ?? null) === 'high' && $r['provider']['allow_fallbacks'] === false);
    }

    public function test_discovery_canonical_alias_is_accepted_without_name_guessing(): void
    {
        $canonical = $this->model()['canonicalModel'];
        Http::fake(['*' => Http::sequence()->push($this->tool($canonical))
            ->push($this->stream($canonical))->push($this->stream($canonical, 'gen-high'))]);
        $proof = app(Probe::class)->run($this->model());
        $this->assertSame([$canonical], array_unique(array_column($proof['receipts'], 'model')));
    }

    public function test_a_different_tool_response_model_is_rejected_before_another_paid_request(): void
    {
        Http::fake(['*' => Http::response($this->tool('openai/gpt-98'))]);
        try { app(Probe::class)->run($this->model()); $this->fail('Substituted model accepted'); }
        catch (\RuntimeException $e) { $this->assertSame('model-receipt-mismatch', $e->getMessage()); }
        Http::assertSentCount(1);
    }

    public function test_a_different_stream_model_is_rejected(): void
    {
        Http::fake(['*' => Http::sequence()->push($this->tool())->push($this->stream('openai/gpt-98'))]);
        $this->expectExceptionMessage('model-receipt-mismatch');
        app(Probe::class)->run($this->model());
    }

    public function test_a_response_without_model_identity_is_rejected(): void
    {
        $tool = $this->tool(); unset($tool['model']);
        Http::fake(['*' => Http::response($tool)]);
        $this->expectExceptionMessage('missing-model-receipt');
        app(Probe::class)->run($this->model());
    }

    public function test_a_stream_cannot_change_generation_mid_response(): void
    {
        $prefix = 'data: '.json_encode(['id' => 'gen-other', 'model' => 'openai/gpt-99', 'choices' => []])."\n\n";
        Http::fake(['*' => Http::sequence()->push($this->tool())->push($prefix.$this->stream())]);
        $this->expectExceptionMessage('generation-receipt-mismatch');
        app(Probe::class)->run($this->model());
    }

    public function test_discovery_rejects_a_cross_provider_canonical_identity(): void
    {
        $this->assertNull(Policy::normalize(['slug' => 'openai/gpt-99', 'canonical_slug' => 'untrusted/substitute',
            'output_modalities' => ['text'], 'supported_parameters' => ['tools'], 'pricing' => $this->model()['pricing']]));
    }
}
