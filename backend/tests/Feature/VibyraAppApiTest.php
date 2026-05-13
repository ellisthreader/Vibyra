<?php

namespace Tests\Feature;

use App\Services\VibyraDesktopState;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Tests\TestCase;

class VibyraAppApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_email_signup_creates_free_account_and_persists_state(): void
    {
        $signup = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex@example.com',
            'password' => 'secret123',
        ]);

        $token = $signup
            ->assertCreated()
            ->assertJsonPath('user.plan', 'free')
            ->assertJsonPath('user.creditsBalance', 50)
            ->json('token');

        $headers = ['Authorization' => "Bearer {$token}"];

        $this->postJson('/api/onboarding/complete', [], $headers)
            ->assertOk()
            ->assertJsonPath('user.onboardingComplete', true);

        $this->postJson('/api/session/state', [
            'rememberedDesktops' => [[
                'url' => 'http://127.0.0.1:4317',
                'pairCode' => 'ABCD12',
                'machineName' => 'Vibyra Desktop',
                'status' => 'online',
            ]],
            'appState' => ['selectedChatModel' => 'gpt-5.4-mini'],
        ], $headers)
            ->assertOk()
            ->assertJsonPath('user.rememberedDesktops.0.pairCode', 'ABCD12');
    }

    public function test_chat_uses_openrouter_and_deducts_credits(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        Http::fake([
            'https://openrouter.ai/api/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => ['content' => 'Here is the answer.'],
                ]],
            ]),
        ]);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex@example.com',
            'password' => 'secret123',
        ])->json('token');

        $this->postJson('/api/chat', [
            'history' => [
                ['role' => 'user', 'text' => 'The login screen is too generic.'],
                ['role' => 'assistant', 'text' => 'I can make it more specific to your app.'],
            ],
            'prompt' => 'Help me ship this feature.',
            'model' => 'gpt-5.4-mini',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('reply', 'Here is the answer.')
            ->assertJsonPath('creditCost', 1)
            ->assertJsonPath('creditsBalance', 49)
            ->assertJsonPath('creditsUsed', 1);

        Http::assertSent(function ($request) {
            $messages = $request['messages'];

            return $request['model'] === 'openai/gpt-4o-mini'
                && $request['max_completion_tokens'] === 800
                && ! array_key_exists('max_tokens', $request->data())
                && $messages[1]['role'] === 'user'
                && $messages[1]['content'] === 'The login screen is too generic.'
                && $messages[2]['role'] === 'assistant'
                && $messages[2]['content'] === 'I can make it more specific to your app.'
                && $messages[3]['role'] === 'user'
                && str_contains($messages[3]['content'], 'Help me ship this feature.');
        });
        Http::assertNotSent(fn ($request) => $request->url() === 'https://api.openai.com/v1/moderations');
    }

    public function test_chat_mode_follow_up_in_game_project_does_not_generate_preview(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        Http::fake([
            'https://openrouter.ai/api/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => ['content' => 'Use Space or tap the screen to shoot. <vibyra-app title="Wrong"><!doctype html><html><body>New build</body></html></vibyra-app>'],
                ]],
            ]),
        ]);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex@example.com',
            'password' => 'secret123',
        ])->json('token');

        $prompt = implode("\n", [
            'Project context:',
            '- Product type: Game',
            '- Preferred framework/stack: Phaser',
            '- Stack reason: Reliable 2D browser game engine.',
            '- Workflow: create a concise internal plan, review it for missing pieces and risk, then implement it in the project files or runnable preview.',
            '- Output rule: prioritize code/project output over conversational explanation.',
            '',
            'User prompt: But whats the control to shoot?',
        ]);

        $this->postJson('/api/chat', [
            'history' => [
                ['role' => 'user', 'text' => 'make a webgl shooter game'],
                ['role' => 'assistant', 'text' => 'I built WebGL Shooter - tap the preview below to run it.'],
            ],
            'mode' => 'chat',
            'model' => 'gpt-5.4-mini',
            'project' => 'WebGL Shooter',
            'prompt' => $prompt,
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('reply', 'Use Space or tap the screen to shoot.')
            ->assertJsonPath('app', null);

        Http::assertSent(function ($request) {
            $messages = $request['messages'];

            return $request['max_completion_tokens'] === 800
                && str_contains($messages[0]['content'], 'Be direct and concise')
                && ! str_contains($messages[0]['content'], 'Return only the <vibyra-app> block.');
        });
    }

    public function test_chat_includes_project_file_map_for_folder_context(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        Http::fake([
            'https://openrouter.ai/api/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => ['content' => 'Auth creates users through the action layer.'],
                ]],
            ]),
        ]);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex@example.com',
            'password' => 'secret123',
        ])->json('token');

        $this->postJson('/api/chat', [
            'mode' => 'chat',
            'model' => 'gpt-5.4-mini',
            'project' => 'ReactLaravel',
            'projectFiles' => [
                ['path' => 'app/Actions/Fortify/CreateNewUser.php', 'language' => 'php', 'loaded' => false],
                ['path' => 'resources/css/theme.css', 'language' => 'css', 'loaded' => true, 'snippet' => ':root { --brand: #8E3CFF; --surface: #0B0D17; }'],
                ['path' => 'routes/web.php', 'language' => 'php', 'loaded' => false],
                ['path' => 'resources/js/Pages/Auth/Register.jsx', 'language' => 'jsx', 'loaded' => false],
            ],
            'prompt' => 'How does signup work in this folder?',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('reply', 'Auth creates users through the action layer.');

        Http::assertSent(function ($request) {
            $messages = $request['messages'];
            $user = $messages[array_key_last($messages)]['content'];

            return str_contains($messages[0]['content'], 'Use the project/folder context first')
                && str_contains($messages[0]['content'], 'instead of telling the user to run shell commands')
                && str_contains($user, 'Project: ReactLaravel')
                && str_contains($user, "Project files:\n- app/Actions/Fortify/CreateNewUser.php")
                && str_contains($user, '- resources/css/theme.css (css loaded)')
                && str_contains($user, '  :root { --brand: #8E3CFF; --surface: #0B0D17; }')
                && str_contains($user, 'Do not respond with bash, grep, find, rg, npm, or terminal commands')
                && str_contains($user, '- routes/web.php')
                && ! str_contains($user, "\n\nFile app/Actions/Fortify/CreateNewUser.php:");
        });
    }

    public function test_colour_scheme_question_replaces_shell_commands_with_direct_answer(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        Http::fake([
            'https://openrouter.ai/api/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => ['content' => "```bash\nrg -n \"#[0-9a-fA-F]{3,8}|rgba?\\(\" src\n```"],
                ]],
            ]),
        ]);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex-colour@example.com',
            'password' => 'secret123',
        ])->json('token');

        $response = $this->postJson('/api/chat', [
            'mode' => 'chat',
            'model' => 'gpt-5.4-mini',
            'project' => 'Vibyra',
            'projectFiles' => [
                ['path' => 'src/styles/theme.ts', 'language' => 'ts', 'loaded' => true, 'snippet' => 'export const colors = { primary: "#8E3CFF", bg: "#0B0D17", text: "#E7E3EF" };'],
                ['path' => 'src/screens/workspace/styles/part20.ts', 'language' => 'ts', 'loaded' => true, 'snippet' => 'color: "#DDBBFF"; backgroundColor: "rgba(176, 132, 255, 0.18)";'],
            ],
            'prompt' => 'What is the colour scheme?',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk();

        $reply = (string) $response->json('reply');
        $this->assertStringContainsString('The colour scheme appears to be', $reply);
        $this->assertStringContainsString('#8E3CFF', $reply);
        $this->assertStringContainsString('#0B0D17', $reply);
        $this->assertStringNotContainsString('rg -n', $reply);
        $this->assertStringNotContainsString('```bash', $reply);
    }

    public function test_preview_change_prompt_uses_build_mode(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        Http::fake([
            'https://openrouter.ai/api/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => ['content' => '<vibyra-app title="Updated Preview"><!doctype html><html><body>Updated</body></html></vibyra-app>'],
                ]],
            ]),
        ]);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex-preview@example.com',
            'password' => 'secret123',
        ])->json('token');

        $this->postJson('/api/chat', [
            'model' => 'gpt-5.4-mini',
            'project' => 'Preview Project',
            'prompt' => 'Make this change to the runnable preview: make the button red',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('app.title', 'Updated Preview');

        Http::assertSent(function ($request) {
            return $request['max_completion_tokens'] === 3000
                && str_contains($request['messages'][0]['content'], 'Return only the <vibyra-app> block.');
        });
    }

    public function test_level_activity_awards_idempotent_xp_and_milestone_credits(): void
    {
        $signup = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex@example.com',
            'password' => 'secret123',
        ]);
        $token = $signup->json('token');
        $startingCredits = (int) $signup->json('user.creditsBalance');
        $headers = ['Authorization' => "Bearer {$token}"];

        $this->postJson('/api/level/activity', [
            'action' => 'coding_agent_completed',
            'contextId' => 'desktop-agent:run-1',
        ], $headers)
            ->assertOk()
            ->assertJsonPath('xpDelta', 80)
            ->assertJsonPath('level.level', 1);

        $this->postJson('/api/level/activity', [
            'action' => 'coding_agent_completed',
            'contextId' => 'desktop-agent:run-1',
        ], $headers)
            ->assertOk()
            ->assertJsonPath('duplicate', true)
            ->assertJsonPath('xpDelta', 0);

        $this->postJson('/api/level/activity', [
            'action' => 'coding_agent_completed',
            'contextId' => 'desktop-agent:run-2',
        ], $headers)
            ->assertOk()
            ->assertJsonPath('xpDelta', 80)
            ->assertJsonPath('level.level', 2)
            ->assertJsonPath('user.creditsBalance', $startingCredits + 5);

        $this->assertDatabaseHas('credit_ledger', [
            'kind' => 'level_reward',
            'credits_delta' => 5,
            'reference' => 'level-reward:2',
        ]);
        $this->assertSame(2, DB::table('user_level_events')->where('action', 'coding_agent_completed')->count());
        $this->assertSame(1, DB::table('user_level_events')->where('action', 'daily_login')->count());
    }

    public function test_chat_does_not_call_openai_moderation(): void
    {
        config(['services.openai.key' => 'test-openai-key']);
        config(['services.openrouter.key' => 'test-openrouter-key']);
        Http::fake([
            'https://api.openai.com/v1/moderations' => Http::response([
                'results' => [[
                    'flagged' => true,
                    'categories' => ['harassment' => true],
                    'category_scores' => ['harassment' => 0.98],
                ]],
            ]),
            'https://openrouter.ai/api/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => ['content' => 'Chat response.'],
                ]],
            ]),
        ]);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex@example.com',
            'password' => 'secret123',
        ])->json('token');

        $this->postJson('/api/chat', [
            'prompt' => 'Please review this public comment.',
            'model' => 'gpt-5.4-mini',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('reply', 'Chat response.');

        Http::assertNotSent(fn ($request) => $request->url() === 'https://api.openai.com/v1/moderations');
        Http::assertSent(fn ($request) => $request->url() === 'https://openrouter.ai/api/v1/chat/completions');
    }

    public function test_desktop_agent_chat_does_not_call_openai_moderation(): void
    {
        config(['services.openai.key' => 'test-openai-key']);
        Http::fake([
            'https://api.openai.com/v1/moderations' => Http::response(['error' => ['message' => 'Unavailable']], 503),
        ]);

        $desktopState = app(VibyraDesktopState::class)->state();
        $prompt = str_repeat('Build ', 1801);

        $this->postJson('/agents/start', [
            'projectId' => (string) ($desktopState['projects'][0]['id'] ?? ''),
            'prompt' => $prompt,
            'model' => 'gpt-5.5',
            'reasoningEffort' => 'medium',
        ], ['Authorization' => 'Bearer '.$desktopState['token']])
            ->assertUnprocessable()
            ->assertJsonPath('error', 'Prompt is too long. Keep it under 8,000 characters.');

        Http::assertNothingSent();
    }

    public function test_desktop_agent_does_not_fall_back_to_first_project_for_unknown_project_id(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        Http::fake([
            'https://openrouter.ai/api/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => ['content' => 'Should not run.'],
                ]],
            ]),
        ]);

        $desktopState = app(VibyraDesktopState::class)->state();

        $this->postJson('/agents/start', [
            'projectId' => 'missing-project-id',
            'prompt' => 'Build a landing page',
            'model' => 'gpt-5.5',
            'reasoningEffort' => 'medium',
        ], ['Authorization' => 'Bearer '.$desktopState['token']])
            ->assertUnprocessable()
            ->assertJsonPath('error', 'No project selected');

        Http::assertNothingSent();
    }

    public function test_desktop_agent_recovers_stale_active_run_before_rejecting(): void
    {
        config(['services.openrouter.key' => '']);

        $statePath = storage_path('app/vibyra/state.json');
        $originalState = File::exists($statePath) ? File::get($statePath) : null;
        $state = app(VibyraDesktopState::class)->state();
        $project = $state['projects'][0];
        $oldTimestamp = now()->subMinutes(10)->toISOString();
        $state['activeAgentRun'] = [
            'id' => 'run-stale',
            'projectId' => $project['id'],
            'model' => 'gpt-5.5',
            'title' => 'Old stuck run',
            'progress' => 65,
            'state' => 'running',
            'file' => 'OpenRouter stream',
            'startedAt' => $oldTimestamp,
            'updatedAt' => $oldTimestamp,
        ];
        $state['lastPromptCompletedAt'] = $oldTimestamp;

        try {
            File::put($statePath, json_encode($state, JSON_PRETTY_PRINT));

            $this->postJson('/agents/start', [
                'projectId' => $project['id'],
                'prompt' => 'Build a landing page',
                'model' => 'gpt-5.5',
                'reasoningEffort' => 'medium',
            ], ['Authorization' => 'Bearer '.$state['token']])
                ->assertUnprocessable()
                ->assertJsonPath('error', 'OPENROUTER_API_KEY is not configured on the desktop backend');

            $updatedState = json_decode(File::get($statePath), true);
            $this->assertNull($updatedState['activeAgentRun']);
            $this->assertSame('Cleared stale desktop AI run state', $updatedState['events'][0]['message']);
        } finally {
            if ($originalState === null) {
                File::delete($statePath);
            } else {
                File::put($statePath, $originalState);
            }
        }
    }

    public function test_desktop_agent_recovers_active_run_with_missing_timestamps(): void
    {
        config(['services.openrouter.key' => '']);

        $statePath = storage_path('app/vibyra/state.json');
        $originalState = File::exists($statePath) ? File::get($statePath) : null;
        $state = app(VibyraDesktopState::class)->state();
        $project = $state['projects'][0];
        $state['activeAgentRun'] = [
            'id' => 'run-stuck',
            'projectId' => $project['id'],
            'model' => 'gpt-5.5',
            'title' => 'Stuck run without timestamps',
            'progress' => 65,
            'state' => 'running',
            'file' => 'OpenRouter stream',
        ];

        try {
            File::put($statePath, json_encode($state, JSON_PRETTY_PRINT));

            $this->postJson('/agents/start', [
                'projectId' => $project['id'],
                'prompt' => 'Build a landing page',
                'model' => 'gpt-5.5',
                'reasoningEffort' => 'medium',
            ], ['Authorization' => 'Bearer '.$state['token']])
                ->assertUnprocessable()
                ->assertJsonPath('error', 'OPENROUTER_API_KEY is not configured on the desktop backend');

            $updatedState = json_decode(File::get($statePath), true);
            $this->assertNull($updatedState['activeAgentRun']);
            $this->assertSame('Cleared stale desktop AI run state', $updatedState['events'][0]['message']);
        } finally {
            if ($originalState === null) {
                File::delete($statePath);
            } else {
                File::put($statePath, $originalState);
            }
        }
    }

    public function test_desktop_agent_busy_response_includes_active_run_context(): void
    {
        $statePath = storage_path('app/vibyra/state.json');
        $originalState = File::exists($statePath) ? File::get($statePath) : null;
        $state = app(VibyraDesktopState::class)->state();
        $project = $state['projects'][0];
        $startedAt = now()->subSeconds(45)->toISOString();
        $state['activeAgentRun'] = [
            'id' => 'run-visible',
            'projectId' => $project['id'],
            'model' => 'gpt-5.4-mini',
            'title' => 'make zombie game',
            'progress' => 42,
            'state' => 'running',
            'file' => 'OpenRouter stream',
            'startedAt' => $startedAt,
            'updatedAt' => $startedAt,
        ];

        try {
            File::put($statePath, json_encode($state, JSON_PRETTY_PRINT));

            $this->postJson('/agents/start', [
                'projectId' => $project['id'],
                'prompt' => 'Build a landing page',
                'model' => 'gpt-5.5',
                'reasoningEffort' => 'medium',
            ], ['Authorization' => 'Bearer '.$state['token']])
                ->assertStatus(429)
                ->assertJsonPath('busyReason', 'active-run')
                ->assertJsonPath('activeAgentRun.title', 'make zombie game')
                ->assertJsonPath('activeAgentRun.projectName', $project['name'])
                ->assertJsonPath('activeAgentRun.progress', 42);
        } finally {
            if ($originalState === null) {
                File::delete($statePath);
            } else {
                File::put($statePath, $originalState);
            }
        }
    }
}
