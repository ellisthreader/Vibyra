<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class VibyraTeamPlanApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_team_plan_requires_authentication(): void
    {
        $this->postJson('/api/chat/team-plan', [
            'goal' => 'Add account settings.',
            'roles' => ['builder', 'reviewer'],
        ])->assertUnauthorized();
    }

    public function test_team_plan_rejects_context_over_the_plan_cap_before_reservation(): void
    {
        config([
            'services.openrouter.key' => 'test-openrouter-key',
            'billing.plans.free.context_token_cap' => 1,
        ]);
        Http::fake();
        $token = $this->signup('team-plan-context-limit@example.com');

        $this->postJson('/api/chat/team-plan', [
            'goal' => 'Add secure profile editing.',
            'roles' => ['builder', 'reviewer'],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertStatus(413)
            ->assertJsonPath('code', 'membership_context_limit');

        Http::assertNothingSent();
        $this->assertDatabaseCount('chat_cost_reservations', 0);
    }

    public function test_team_plan_uses_strict_gpt_mini_output_and_returns_normalized_untrusted_proposal(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        $payloads = [];
        Http::fake(function ($request) use (&$payloads) {
            $payloads[] = $request->data();

            return Http::response([
                'choices' => [[
                    'message' => ['content' => json_encode($this->validPlan())],
                ]],
                'usage' => [
                    'prompt_tokens' => 900,
                    'completion_tokens' => 500,
                    'reasoning_tokens' => 20,
                    'cost' => 0.003,
                ],
            ]);
        });

        $token = $this->signup('team-plan-success@example.com');
        User::where('email', 'team-plan-success@example.com')->update([
            'credits_balance' => 500,
        ]);

        $this->postJson('/api/chat/team-plan', [
            'goal' => 'Add secure profile editing and verify it works.',
            'roles' => ['coordinator', 'builder', 'verifier', 'reviewer'],
            'projectContext' => [
                'summary' => 'Laravel API with a desktop client.',
                'candidatePaths' => ['backend/routes/web.php', 'backend/app/Http/Controllers'],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('untrusted', true)
            ->assertJsonPath('model', 'gpt-5.4-mini')
            ->assertJsonPath('proposal.schemaVersion', 'vibyra.team-plan.v1')
            ->assertJsonPath('proposal.assignments.1.roleKey', 'builder')
            ->assertJsonPath('proposal.assignments.1.writeScope.0.path', 'backend/app/Http/Controllers/ProfileController.php')
            ->assertJsonPath('proposal.acceptanceCriteria.0.evidenceRequired', 'command_result');

        $this->assertCount(1, $payloads);
        $payload = $payloads[0];
        $this->assertSame('openai/gpt-5.4-mini', $payload['model'] ?? null);
        $this->assertSame(1800, $payload['max_completion_tokens'] ?? null);
        $this->assertSame('low', $payload['reasoning']['effort'] ?? null);
        $this->assertTrue($payload['reasoning']['exclude'] ?? false);
        $this->assertSame('json_schema', $payload['response_format']['type'] ?? null);
        $this->assertTrue($payload['response_format']['json_schema']['strict'] ?? false);
        $this->assertFalse($payload['response_format']['json_schema']['schema']['additionalProperties'] ?? true);
        $this->assertStringContainsString(
            '<UNTRUSTED_TEAM_INPUT>',
            $payload['messages'][1]['content'] ?? ''
        );
        $this->assertSame(1, DB::table('credit_ledger')->count());
        $this->assertDatabaseHas('chat_cost_reservations', [
            'model_key' => 'team-plan',
            'model_slug' => 'openai/gpt-5.4-mini',
            'status' => 'settled',
        ]);
    }

    public function test_team_plan_rejects_an_invalid_topology_before_reserving_credits(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        Http::fake();
        $token = $this->signup('team-plan-topology@example.com');

        $this->postJson('/api/chat/team-plan', [
            'goal' => 'Build the feature.',
            'roles' => ['coordinator', 'builder'],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertStatus(422)
            ->assertJsonPath('error', 'roles must include exactly one Builder and one Reviewer.');

        Http::assertNothingSent();
        $this->assertDatabaseCount('chat_cost_reservations', 0);
    }

    public function test_team_plan_rejects_unknown_or_privileged_model_output_and_still_settles_usage(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        $invalid = $this->validPlan(['builder', 'reviewer']);
        $invalid['assignments'][1]['write_scope'] = [[
            'kind' => 'file',
            'path' => 'backend/routes/web.php',
        ]];
        $invalid['assignments'][0]['permissions'] = ['full_access'];

        Http::fake([
            '*' => Http::response([
                'choices' => [[
                    'message' => ['content' => json_encode($invalid)],
                ]],
                'usage' => ['prompt_tokens' => 400, 'completion_tokens' => 200, 'cost' => 0.002],
            ]),
        ]);
        $token = $this->signup('team-plan-invalid-output@example.com');

        $this->postJson('/api/chat/team-plan', [
            'goal' => 'Update the API.',
            'roles' => ['builder', 'reviewer'],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertStatus(502)
            ->assertJsonPath('code', 'invalid_team_plan');

        $this->assertDatabaseHas('chat_cost_reservations', [
            'model_key' => 'team-plan',
            'status' => 'settled',
        ]);
        $ledger = DB::table('credit_ledger')->first();
        $this->assertNotNull($ledger);
        $this->assertSame('invalid_schema', json_decode($ledger->meta, true)['attempts'][0]['outcome']);
    }

    public function test_team_plan_releases_reserved_credits_when_provider_rejects_without_usage(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        Http::fake(['*' => Http::response(['error' => ['message' => 'Rejected']], 400)]);
        $token = $this->signup('team-plan-provider-error@example.com');
        $before = User::where('email', 'team-plan-provider-error@example.com')->value('credits_balance');

        $this->postJson('/api/chat/team-plan', [
            'goal' => 'Update the API.',
            'roles' => ['builder', 'reviewer'],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertStatus(400)
            ->assertJsonPath('code', 'team_plan_provider_error');

        $this->assertSame(
            $before,
            User::where('email', 'team-plan-provider-error@example.com')->value('credits_balance')
        );
        $this->assertDatabaseHas('chat_cost_reservations', [
            'model_key' => 'team-plan',
            'status' => 'released',
            'release_reason' => 'provider_error_without_usage',
        ]);
        $this->assertDatabaseCount('credit_ledger', 0);
    }

    private function signup(string $email): string
    {
        return (string) $this->postJson('/api/auth/signup', [
            'name' => 'Team Planner User',
            'email' => $email,
            'password' => 'secret123',
        ])->json('token');
    }

    private function validPlan(
        array $roles = ['coordinator', 'builder', 'verifier', 'reviewer']
    ): array {
        $assignments = [];
        foreach ($roles as $role) {
            $assignments[] = [
                'role_key' => $role,
                'objective' => ucfirst($role).' handles its bounded assignment.',
                'deliverables' => ["{$role} deliverable"],
                'assumptions' => [],
                'non_goals' => ['Do not change permissions.'],
                'focus_areas' => ['Profile editing'],
                'inspect_scope' => [[
                    'kind' => 'directory',
                    'path' => 'backend/app',
                ]],
                'write_scope' => $role === 'builder' ? [[
                    'kind' => 'file',
                    'path' => 'backend/app/Http/Controllers/ProfileController.php',
                ]] : [],
                'acceptance_criteria_keys' => ['profile-tests'],
                'validation_intents' => [[
                    'kind' => $role === 'builder' ? 'test' : 'inspect',
                    'target' => 'Profile API behavior',
                ]],
                'risks' => ['Authorization regression'],
                'completion_evidence' => ['Focused evidence'],
            ];
        }

        return [
            'schema_version' => 'vibyra.team-plan.v1',
            'goal_summary' => 'Add secure profile editing.',
            'assumptions' => ['Existing authentication remains authoritative.'],
            'non_goals' => ['Do not change provider credentials.'],
            'assignments' => $assignments,
            'acceptance_criteria' => [[
                'key' => 'profile-tests',
                'statement' => 'Focused profile tests pass.',
                'evidence_required' => 'command_result',
            ]],
            'open_questions' => [],
        ];
    }
}
