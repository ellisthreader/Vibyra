<?php
namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, DB, Http};
use Illuminate\Support\Str;
use Tests\TestCase;

final class TerminalDecisionsTest extends TestCase
{
    use RefreshDatabase;
    private bool $unavailable = false;
    protected function setUp(): void
    {
        parent::setUp(); Cache::flush(); Http::preventStrayRequests();
        config(['intelligence.jev_mode' => 'active', 'intelligence.terminal_auto' => true,
            'intelligence.jev_key' => 'dedicated-fixture', 'services.openrouter.key' => 'separate-fixture']);
        $user = User::factory()->create();
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', 'terminal-test'), 'device_name' => 'iPhone']);
        $this->withToken('terminal-test');
        Http::fake(function ($request) {
            if (str_ends_with($request->url(), '/key')) return Http::response(['data' => ['limit' => 5, 'limit_remaining' => 5,
                'limit_reset' => null, 'include_byok_in_limit' => true, 'is_management_key' => false, 'is_provisioning_key' => false]]);
            if ($this->unavailable) return Http::response([], 502);
            $answers = [];
            foreach ($request['questions'] as $name => $q) {
                $keys = array_keys($q['criteria']); $choice = $name === 'model' ? 'model_1' : 'high';
                $answers[$name] = ['type' => 'choice', 'choice' => $choice, 'confidence' => 0.99,
                    'probabilities' => array_combine($keys, array_map(fn ($key) => $key === $choice ? 1 : 0, $keys))];
            }
            return Http::response(['model' => config('intelligence.jev_served_model'), 'answers' => $answers, 'usage' => ['cost' => 0.00003]]);
        });
    }
    private function request(): array
    {
        return ['id' => (string) Str::uuid(), 'text' => 'Diagnose this difficult concurrency bug', 'source' => 'accounts', 'consent' => true,
            'models' => [['id' => 'openai/code-small', 'name' => 'Small', 'efforts' => ['low', 'medium']],
                ['id' => 'anthropic/code-large', 'name' => 'Large', 'efforts' => ['low', 'high']]]];
    }
    public function test_jev_selects_an_exact_model_and_supported_effort_without_wallet_or_inference(): void
    {
        $data = $this->request();
        $this->postJson('/api/vibes/terminal-decisions', $data)->assertOk()->assertJsonPath('selection.model', 'anthropic/code-large')->assertJsonPath('selection.effort', 'high');
        $this->postJson('/api/vibes/terminal-decisions', $data)->assertOk();
        Http::assertSentCount(2); // Key policy plus one decision; the retry never spends again.
        $this->assertSame(0, DB::table('vibes_turns')->count());
        $this->assertSame(0, DB::table('vibes_wallets')->count());
        $this->assertSame(1, DB::table('decision_spend_buckets')->where('id', 'lifetime')->value('calls'));
        $this->postJson('/api/vibes/terminal-decisions', [...$data, 'text' => 'Changed'])->assertStatus(409);
    }
    public function test_no_implicit_consent_router_candidates_or_disabled_fallback(): void
    {
        $data = $this->request();
        $this->postJson('/api/vibes/terminal-decisions', [...$data, 'consent' => false])->assertStatus(422);
        $data['models'] = [['id' => 'typesafe/jev-router', 'name' => 'Router', 'efforts' => []]];
        $this->postJson('/api/vibes/terminal-decisions', $data)->assertStatus(422);
        config(['intelligence.jev_mode' => 'off']);
        $this->postJson('/api/vibes/terminal-decisions', $this->request())->assertStatus(503);
        Http::assertNothingSent();
    }
    public function test_token_routing_cannot_use_client_claims_to_bypass_pro_or_rollout(): void
    {
        $this->postJson('/api/vibes/terminal-decisions', [...$this->request(), 'source' => 'vibyra'])->assertStatus(503);
        Http::assertNothingSent();
    }
    public function test_no_supported_effort_means_no_effort_and_unpriced_failure_trips_shared_guard(): void
    {
        $data = $this->request(); $data['models'] = [$data['models'][0]]; $data['models'][0]['efforts'] = [];
        $this->postJson('/api/vibes/terminal-decisions', $data)->assertOk()->assertJsonPath('selection.effort', null);
        $this->unavailable = true;
        $this->postJson('/api/vibes/terminal-decisions', $this->request())->assertStatus(503);
        $this->assertTrue((bool) DB::table('decision_spend_controls')->value('tripped'));
    }
}
