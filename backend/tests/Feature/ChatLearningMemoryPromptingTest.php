<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ChatLearningMemoryPromptingTest extends TestCase
{
    use RefreshDatabase;

    public function test_relevant_prior_learning_memory_is_injected_into_openrouter_messages(): void
    {
        $payloads = [];
        $this->fakeOpenRouter($payloads, 'Use the inline script fix again.');
        [$token, $userId] = $this->signupUser('alex-learning-relevant@example.com');

        $this->insertLearningMemory($userId, [
            'project_name' => 'Preview App',
            'prompt' => 'Fix the blank preview caused by a local script file.',
            'response_summary' => 'Working outcome: inline the script and avoid local preview files.',
        ]);

        $this->postJson('/api/chat', [
            'mode' => 'chat',
            'model' => 'gpt-5.4-mini',
            'project' => 'Preview App',
            'prompt' => 'The preview is blank again with a local script error. What fix should I reuse?',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('reply', 'Use the inline script fix again.');

        $userMessage = $this->lastOpenRouterUserMessage($payloads);
        $this->assertLearningContextPresent($userMessage);
        $this->assertStringContainsString('Fix the blank preview caused by a local script file.', $userMessage);
        $this->assertStringContainsString('inline the script', $userMessage);
    }

    public function test_unrelated_project_learning_memory_is_not_injected(): void
    {
        $payloads = [];
        $this->fakeOpenRouter($payloads, 'No project memory was needed.');
        [$token, $userId] = $this->signupUser('alex-learning-unrelated@example.com');

        $this->insertLearningMemory($userId, [
            'project_name' => 'Billing Console',
            'prompt' => 'Repair billing webhook signature retries.',
            'response_summary' => 'Other project outcome: adjust Stripe renewal ledger handling.',
            'tags' => json_encode(['chat', 'billing'], JSON_UNESCAPED_SLASHES),
        ]);

        $this->postJson('/api/chat', [
            'mode' => 'chat',
            'model' => 'gpt-5.4-mini',
            'project' => 'Preview App',
            'prompt' => 'The preview is blank again with a local script error. What fix should I reuse?',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('reply', 'No project memory was needed.');

        $userMessage = $this->lastOpenRouterUserMessage($payloads);
        $this->assertLearningContextMissing($userMessage);
        $this->assertStringNotContainsString('Other project outcome', $userMessage);
    }

    public function test_failed_learning_memory_is_excluded_or_ranked_below_useful_memory(): void
    {
        $payloads = [];
        $this->fakeOpenRouter($payloads, 'Prefer the working outcome.');
        [$token, $userId] = $this->signupUser('alex-learning-negative@example.com');

        $this->insertLearningMemory($userId, [
            'project_name' => 'Preview App',
            'score' => 1,
            'prompt' => 'Blank preview failed attempt.',
            'response_summary' => 'Failed attempt: left the external script in place and the preview stayed broken.',
            'tags' => json_encode(['chat', 'failed', 'preview'], JSON_UNESCAPED_SLASHES),
            'created_at' => now()->addMinute(),
            'updated_at' => now()->addMinute(),
        ]);
        $this->insertLearningMemory($userId, [
            'project_name' => 'Preview App',
            'score' => 3,
            'prompt' => 'Fix blank preview local script file errors with inline code and guarded fallback.',
            'response_summary' => 'Working outcome: inline the local script, keep the fallback guarded, and reuse this fix for blank preview script errors.',
            'tags' => json_encode(['chat', 'fix', 'preview'], JSON_UNESCAPED_SLASHES),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->postJson('/api/chat', [
            'mode' => 'chat',
            'model' => 'gpt-5.4-mini',
            'project' => 'Preview App',
            'prompt' => 'The blank preview still throws a local script file error. Which fix should I reuse?',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('reply', 'Prefer the working outcome.');

        $userMessage = $this->lastOpenRouterUserMessage($payloads);
        $this->assertStringContainsString('Working outcome: inline the local script', $userMessage);

        $failedPosition = strpos($userMessage, 'Failed attempt:');
        if ($failedPosition !== false) {
            $this->assertLessThan(
                $failedPosition,
                strpos($userMessage, 'Working outcome: inline the local script')
            );
        }
    }

    public function test_chat_succeeds_when_learning_table_is_empty(): void
    {
        $payloads = [];
        $this->fakeOpenRouter($payloads, 'Empty memory answer.');
        [$token] = $this->signupUser('alex-learning-empty@example.com');

        $this->assertDatabaseCount('chat_learning_memories', 0);

        $this->postJson('/api/chat', [
            'mode' => 'chat',
            'model' => 'gpt-5.4-mini',
            'project' => 'Preview App',
            'prompt' => 'Can you help me check this project?',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('reply', 'Empty memory answer.');

        $userMessage = $this->lastOpenRouterUserMessage($payloads);
        $this->assertLearningContextMissing($userMessage);
    }

    private function fakeOpenRouter(array &$payloads, string $reply): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        Http::fake(function ($request) use (&$payloads, $reply) {
            $payloads[] = $request->data();

            return Http::response([
                'choices' => [[
                    'message' => ['content' => $reply],
                ]],
            ]);
        });
    }

    private function signupUser(string $email): array
    {
        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => $email,
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        return [
            $token,
            (int) DB::table('users')->where('email', $email)->value('id'),
        ];
    }

    private function insertLearningMemory(int $userId, array $overrides = []): void
    {
        $projectName = array_key_exists('project_name', $overrides)
            ? $overrides['project_name']
            : 'Preview App';

        DB::table('chat_learning_memories')->insert(array_merge([
            'user_id' => $userId,
            'project_key' => $this->learningProjectKey($projectName),
            'project_name' => $projectName,
            'mode' => 'chat',
            'model_key' => 'gpt-5.4-mini',
            'skill_id' => null,
            'score' => 2,
            'prompt' => 'Fix a blank preview issue.',
            'response_summary' => 'Working outcome: reuse the known preview fix.',
            'tags' => json_encode(['chat', 'preview'], JSON_UNESCAPED_SLASHES),
            'reference' => 'test:'.uniqid('', true),
            'created_at' => now(),
            'updated_at' => now(),
        ], $overrides));
    }

    private function learningProjectKey(?string $projectName): ?string
    {
        $projectName = trim(strtolower((string) $projectName));

        return $projectName === '' ? null : hash('sha256', $projectName);
    }

    private function lastOpenRouterUserMessage(array $payloads): string
    {
        $this->assertNotEmpty($payloads);
        $payload = $payloads[array_key_last($payloads)];
        $messages = $payload['messages'] ?? [];
        $this->assertNotEmpty($messages);
        $message = $messages[array_key_last($messages)];
        $this->assertSame('user', $message['role'] ?? null);

        return (string) ($message['content'] ?? '');
    }

    private function assertLearningContextPresent(string $message): void
    {
        $this->assertMatchesRegularExpression(
            '/(Relevant past Vibyra learning|Suggested past Vibyra memories)/',
            $message
        );
    }

    private function assertLearningContextMissing(string $message): void
    {
        $this->assertDoesNotMatchRegularExpression(
            '/(Relevant past Vibyra learning|Suggested past Vibyra memories)/',
            $message
        );
    }
}
