<?php

namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use App\Services\Decisions\{DecisionUnavailable, JevClient, JevResponse, TerminalChoices};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\{Cache, DB, Http};
use Illuminate\Support\Str;
use Tests\TestCase;

final class TerminalAutoReliabilityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Http::preventStrayRequests();
        config(['intelligence.jev_mode' => 'active', 'intelligence.terminal_auto' => true,
            'intelligence.jev_key' => 'dedicated-fixture', 'services.openrouter.key' => 'other-fixture']);
        $user = User::factory()->create();
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', 'auto-test'), 'device_name' => 'iPhone']);
        $this->withToken('auto-test');
    }

    private function request(): array
    {
        return ['id' => (string) Str::uuid(), 'source' => 'accounts', 'consent' => true, 'text' => 'Fix a race condition',
            'models' => [['id' => 'openai/code', 'name' => 'Code', 'efforts' => ['low', 'medium', 'high']]]];
    }

    private function response(array $questions, string $effort = 'high'): array
    {
        $answers = [];
        foreach ($questions as $id => $question) {
            $choice = $id === 'model' ? 'model_0' : $effort;
            $answers[$id] = ['type' => 'choice', 'choice' => $choice, 'confidence' => 1,
                'probabilities' => []];
            $answers[$id]['probabilities'] = array_combine(array_keys($question['criteria']),
                array_map(fn ($key) => $key === $choice ? 1 : 0, array_keys($question['criteria'])));
        }

        return ['model' => config('intelligence.jev_served_model'), 'answers' => $answers, 'usage' => ['cost' => 0.00005]];
    }

    private function fake(callable $decision): void
    {
        Http::fake(function ($request, $options) use ($decision) {
            if (str_ends_with($request->url(), '/key')) {
                return Http::response(['data' => ['limit' => 5, 'limit_remaining' => 5, 'limit_reset' => null,
                    'include_byok_in_limit' => true, 'is_management_key' => false, 'is_provisioning_key' => false]]);
            }
            return $decision($request, $options);
        });
    }

    public function test_interactive_deadline_and_lease_survive_a_response_slower_than_one_second(): void
    {
        $this->fake(function ($request, $options) {
            $this->assertSame(12, $options['timeout']);
            $this->assertSame(3, $options['connect_timeout']);
            $this->travel(4)->seconds();
            $this->assertTrue(now()->lt(DB::table('decision_spend_controls')->value('busy_until')));
            return Http::response($this->response($request['questions']));
        });
        $data = $this->request();
        $this->postJson('/api/vibes/terminal-decisions', $data)->assertOk()->assertJsonPath('selection.effort', 'high');
        $this->postJson('/api/vibes/terminal-decisions', $data)->assertOk();
        Http::assertSentCount(2);
    }

    public function test_transport_failure_is_not_retried_and_is_diagnosable_without_provider_text(): void
    {
        $this->fake(fn () => throw new ConnectionException('secret provider body'));
        $data = $this->request();
        $this->postJson('/api/vibes/terminal-decisions', $data)->assertStatus(503)->assertDontSee('secret provider body');
        $this->assertDatabaseHas('ai_decisions', ['id' => $data['id'], 'reason' => 'provider_transport', 'input' => null]);
        $this->assertTrue((bool) DB::table('decision_spend_controls')->value('tripped'));
        $this->assertNull(DB::table('decision_spend_controls')->value('owner'));
        Http::assertSentCount(1); // Failed connections are not recorded by Laravel.
    }

    public function test_billable_invalid_answer_preserves_price_and_safe_reason(): void
    {
        $this->fake(function ($request) {
            $body = $this->response($request['questions']);
            $body['answers']['effort']['choice'] = 'invented';
            return Http::response($body);
        });
        $data = $this->request();
        $this->postJson('/api/vibes/terminal-decisions', $data)->assertStatus(503);
        $this->assertDatabaseHas('ai_decisions', ['id' => $data['id'], 'reason' => 'invalid_answer', 'usage_micro_usd' => 50]);
        $this->assertFalse((bool) DB::table('decision_spend_controls')->value('tripped'));
    }

    public function test_open_circuit_returns_actionable_503_without_paid_request(): void
    {
        Cache::put('jev:circuit', true, 30);
        $this->fake(fn () => $this->fail('Must not call Jev'));
        $this->postJson('/api/vibes/terminal-decisions', $this->request())->assertStatus(503);
        $this->assertFalse((bool) DB::table('decision_spend_controls')->value('tripped'));
        Http::assertSentCount(1);
    }

    public function test_unicode_within_input_limit_is_not_rejected_due_to_json_escaping(): void
    {
        $this->fake(fn ($request) => Http::response($this->response($request['questions'])));
        $this->postJson('/api/vibes/terminal-decisions', [...$this->request(), 'text' => str_repeat('界', 2500)])->assertOk();
    }

    public function test_every_effort_stays_on_the_selected_models_ladder(): void
    {
        $choices = app(TerminalChoices::class);
        foreach ([[], ['minimal'], ['low', 'high'], ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']] as $ladder) {
            $models = [['id' => 'openai/code', 'name' => 'Code', 'efforts' => $ladder]];
            $questions = $choices->questions($models);
            foreach (array_keys($questions['effort']['criteria']) as $effort) {
                $result = JevResponse::parse($this->response($questions, $effort), $questions);
                $selection = $choices->selection($models, $result);
                $this->assertSame('openai/code', $selection['model']);
                if ($ladder) $this->assertContains($selection['effort'], $ladder);
                else $this->assertNull($selection['effort']);
                if (in_array($effort, $ladder, true)) $this->assertSame($effort, $selection['effort']);
            }
        }
    }

    public function test_malformed_choice_types_are_rejected_without_losing_billing(): void
    {
        $questions = app(TerminalChoices::class)->questions($this->request()['models']);
        $body = $this->response($questions);
        $body['answers']['effort']['choice'] = ['high'];
        Http::fake(['*' => Http::response($body)]);
        try {
            app(JevClient::class)->decide([], $questions);
            $this->fail('Malformed choice accepted');
        } catch (DecisionUnavailable $error) {
            $this->assertSame(50, $error->usageMicroUsd);
            $this->assertSame('invalid_answer', $error->reason);
        }
    }
}
