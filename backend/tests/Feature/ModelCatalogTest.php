<?php

namespace Tests\Feature;

use App\Services\ModelCatalog\{Attempts, Discovery, Policy, Probe, Publisher};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ModelCatalogTest extends TestCase
{
    use RefreshDatabase;

    private string $publicKey;
    private array $roster = [];

    protected function setUp(): void
    {
        parent::setUp();
        $pair = sodium_crypto_sign_keypair();
        $this->publicKey = sodium_crypto_sign_publickey($pair);
        config(['model_catalog.enabled' => true, 'model_catalog.publish' => true,
            'model_catalog.signing_key' => bin2hex(sodium_crypto_sign_secretkey($pair)),
            'model_catalog.source_url' => 'https://openrouter.test/models']);
        Http::fake(['https://openrouter.test/models' => fn () => Http::response(['data' => $this->roster])]);
    }

    private function raw(string $id = 'openai/gpt-99'): array
    {
        return ['id' => $id, 'name' => 'OpenAI: GPT 99', 'created' => time() - 100,
            'architecture' => ['output_modalities' => ['text'], 'input_modalities' => ['text']],
            'pricing' => ['prompt' => '0.000001', 'completion' => '0.000002'],
            'supported_parameters' => ['tools', 'reasoning'], 'context_length' => 128000,
            'reasoning' => ['supported_efforts' => ['low', 'high'], 'default_effort' => 'low']];
    }

    private function discover(array $models): void
    {
        $this->roster = $models;
        app(Discovery::class)->run();
    }

    private function eligible(): void
    {
        DB::table('model_catalog_models')->update(['status' => 'eligible', 'verified_at' => now()]);
    }

    public function test_discovery_cannot_publish_unverified_models_or_membership_access(): void
    {
        $this->discover([$this->raw()]);
        $this->assertNull(app(Publisher::class)->publish());
        $this->get('/web-api/model-catalog')->assertStatus(503);
        $this->eligible();
        $revision = app(Publisher::class)->publish();
        app()->forgetScopedInstances(); // A new HTTP request gets a new scoped publication snapshot.
        $reply = $this->get('/web-api/model-catalog')->assertOk();
        $envelope = $reply->json();
        $this->assertTrue(sodium_crypto_sign_verify_detached(hex2bin($envelope['signature']), $envelope['payload'], $this->publicKey));
        $payload = json_decode($envelope['payload'], true);
        $this->assertSame($revision, $payload['revision']);
        $this->assertFalse($payload['models'][0]['auto']);
        $this->assertSame('openrouter', $payload['models'][0]['route']);
        $this->assertArrayNotHasKey('accountRoute', $payload['models'][0]);
        $this->get('/web-api/model-catalog', ['If-None-Match' => $reply->headers->get('ETag')])->assertStatus(304);
        $this->assertSame($revision, app(Publisher::class)->publish());
    }

    public function test_changed_metadata_needs_new_proof_and_bad_discovery_preserves_last_good_revision(): void
    {
        $this->discover([$this->raw()]); $this->eligible();
        $first = app(Publisher::class)->publish();
        $changed = $this->raw(); $changed['pricing']['completion'] = '0.000003';
        $this->discover([$changed]);
        $this->assertDatabaseHas('model_catalog_models', ['id' => $changed['id'], 'status' => 'discovered', 'verified_at' => null]);
        $this->roster = [];
        try { app(Discovery::class)->run(); $this->fail('Empty source accepted'); } catch (\RuntimeException) {}
        $this->assertSame($first, (int) DB::table('model_catalog_state')->value('revision'));
    }

    public function test_rollback_is_a_new_signed_revision_and_removal_requires_three_observations(): void
    {
        $this->discover([$this->raw(), $this->raw('anthropic/claude-opus-99')]);
        $this->eligible(); $first = app(Publisher::class)->publish();
        for ($i = 0; $i < 2; $i++) $this->discover([$this->raw()]);
        $this->assertDatabaseHas('model_catalog_models', ['id' => 'anthropic/claude-opus-99', 'status' => 'eligible']);
        $this->discover([$this->raw()]);
        $second = app(Publisher::class)->publish();
        $this->assertGreaterThan($first, $second);
        $third = app(Publisher::class)->publish($first);
        $this->assertGreaterThan($second, $third);
        $this->assertCount(2, json_decode($this->get('/web-api/model-catalog')->json('payload'), true)['models']);
    }

    public function test_spend_is_reserved_once_and_unknown_attempts_are_not_refunded(): void
    {
        config(['model_catalog.probe_daily_micro' => 100]);
        $attempts = app(Attempts::class);
        $id = $attempts->claim('openai/gpt-99', str_repeat('a', 64), 'probe', 60);
        $this->assertNotNull($id);
        $this->assertNull($attempts->claim('openai/gpt-99', str_repeat('a', 64), 'probe', 60));
        $attempts->finish($id, 'unknown');
        $this->assertNull($attempts->claim('openai/gpt-100', str_repeat('b', 64), 'probe', 60));
        $this->assertSame(60, (int) DB::table('model_catalog_budgets')->value('reserved_micro'));
    }

    public function test_expired_proof_disables_last_model_and_rollback_cannot_reenable_it(): void
    {
        $this->discover([$this->raw()]); $this->eligible();
        $first = app(Publisher::class)->publish();
        DB::table('model_catalog_models')->update(['verified_at' => now()->subHours(25)]);
        $second = app(Publisher::class)->publish();
        $this->assertGreaterThan($first, $second);
        $payload = json_decode(DB::table('model_catalog_revisions')->find($second)->payload, true);
        $this->assertSame(['openai/gpt-99'], $payload['disabled']);
        $this->assertSame([], app(\App\Services\ModelCatalog\PublishedCatalog::class)->models());
        $third = app(Publisher::class)->publish($first);
        $this->assertSame($payload['disabled'], json_decode(DB::table('model_catalog_revisions')->find($third)->payload, true)['disabled']);
    }

    public function test_health_detects_stalled_jobs_and_missing_stage_credentials(): void
    {
        DB::table('model_catalog_state')->insert(['id' => 1, 'last_run_at' => now()]);
        $this->get('/web-api/model-catalog/health')->assertOk();
        config(['model_catalog.validate' => true, 'model_catalog.probe_key' => '']);
        $this->get('/web-api/model-catalog/health')->assertStatus(503);
        config(['model_catalog.validate' => false]);
        DB::table('model_catalog_state')->update(['last_run_at' => now()->subMinutes(31)]);
        $this->get('/web-api/model-catalog/health')->assertStatus(503);
    }

    public function test_probe_checks_tool_result_stream_and_each_effort(): void
    {
        $this->discover([$this->raw()]);
        $m = json_decode(DB::table('model_catalog_models')->value('metadata'), true);
        Http::fake(['*' => Http::sequence()->push(['choices' => [['message' => ['tool_calls' => [
            ['id' => 'call-1', 'type' => 'function', 'function' => ['name' => 'catalog_echo', 'arguments' => '{"word":"ready"}']],
        ]]]]])->push("data: {\"choices\":[{\"delta\":{\"content\":\"ready\"},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n")
            ->push("data: {\"choices\":[{\"delta\":{\"content\":\"ready\"},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n")]);
        $proof = app(Probe::class)->run($m);
        $this->assertSame(['tool-call', 'tool-result', 'stream', 'efforts'], $proof['checks']);
        Http::assertSentCount(3);
        Http::assertSent(fn ($r) => ($r['reasoning']['effort'] ?? null) === 'high' && $r['provider']['allow_fallbacks'] === false);
    }

    public function test_unsupported_cost_dimensions_and_unknown_families_are_not_admitted(): void
    {
        $this->discover([$this->raw(), $this->raw('openai/gpt-99-mini'), $this->raw('unknown/test')]);
        $this->assertDatabaseCount('model_catalog_models', 1);
        $m = json_decode(DB::table('model_catalog_models')->value('metadata'), true);
        $this->assertFalse($m['auto']);
        $this->get('/web-api/model-catalog/artwork/'.str_repeat('a', 64))->assertNotFound();
    }

    public function test_terminal_pagination_rejects_a_cursor_after_only_catalog_eligibility_changes(): void
    {
        $this->discover([$this->raw()]); $this->eligible();
        app(Publisher::class)->publish();
        $pricing = \Mockery::mock(\App\Services\Billing\OpenRouterPricingCatalog::class);
        $pricing->shouldReceive('isStale')->andReturn(false);
        $pricing->shouldReceive('snapshot')->andReturn(['models' => []]);
        $terminal = new \App\Services\Vibes\TerminalCatalog($pricing);
        $cursor = $terminal->page(1)['revision'];
        DB::table('model_catalog_models')->update(['verified_at' => now()->subHours(25)]);
        app(Publisher::class)->publish();
        app()->forgetScopedInstances();
        try { $terminal->page(2, $cursor); $this->fail('Stale eligibility cursor accepted'); }
        catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            $this->assertSame(409, $e->getStatusCode());
        }
    }

    public function test_known_probe_failures_have_only_two_bounded_retries(): void
    {
        $this->travelTo(now()->startOfDay()->addHours(1));
        $this->discover([$this->raw()]);
        config(['model_catalog.validate' => true, 'model_catalog.probe_key' => 'test-probe']);
        Http::fake(['https://openrouter.ai/api/v1/chat/completions' => Http::response([], 400)]);
        $validation = app(\App\Services\ModelCatalog\Validation::class);
        $validation->run(); $validation->run();
        $this->assertDatabaseCount('model_catalog_attempts', 1);
        $this->travel(16)->minutes(); $validation->run(); $validation->run();
        $this->assertDatabaseCount('model_catalog_attempts', 2);
        $this->travel(61)->minutes(); $validation->run(); $validation->run();
        $this->assertDatabaseCount('model_catalog_attempts', 3);
        $this->assertDatabaseHas('model_catalog_models', ['status' => 'quarantined']);
    }
}
