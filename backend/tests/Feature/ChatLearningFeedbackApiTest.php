<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ChatLearningFeedbackApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_feedback_updates_only_authenticated_users_matching_reference(): void
    {
        [$token, $userId] = $this->signupUser('alex-feedback@example.com');
        [, $otherUserId] = $this->signupUser('other-feedback@example.com');
        $reference = 'chat:feedback-123';

        $this->insertMemory($userId, ['reference' => $reference, 'tags' => json_encode(['chat', 'debug'])]);
        $otherMemoryId = $this->insertMemory($otherUserId, ['reference' => $reference, 'score' => 3]);

        $this->postJson('/api/chat/learning/feedback', [
            'reference' => $reference,
            'feedback' => 'did-not-work',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('updatedCount', 1)
            ->assertJsonPath('feedback', 'did_not_work');

        $updated = DB::table('chat_learning_memories')
            ->where('user_id', $userId)
            ->where('reference', $reference)
            ->first();

        $this->assertSame(0, (int) $updated->score);
        $this->assertContains('feedback:did_not_work', json_decode($updated->tags, true));
        $this->assertContains('feedback:negative', json_decode($updated->tags, true));

        if (Schema::hasColumn('chat_learning_memories', 'outcome_status')) {
            $this->assertSame('did_not_work', $updated->outcome_status);
            $this->assertSame(-1, (int) $updated->feedback_score);
            $this->assertSame('api', $updated->feedback_source);
            $this->assertNotNull($updated->feedback_at);
        }

        $this->assertSame(3, (int) DB::table('chat_learning_memories')->where('id', $otherMemoryId)->value('score'));
    }

    public function test_feedback_returns_ok_when_reference_does_not_match(): void
    {
        [$token] = $this->signupUser('missing-feedback@example.com');

        $this->postJson('/api/chat/learning/feedback', [
            'reference' => 'chat:no-match',
            'feedback' => 'worked',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('updatedCount', 0)
            ->assertJsonPath('feedback', 'worked');
    }

    public function test_feedback_can_target_learning_memory_id_when_reference_is_absent(): void
    {
        [$token, $userId] = $this->signupUser('id-feedback@example.com');
        $memoryId = $this->insertMemory($userId, ['reference' => null, 'score' => 2]);

        $this->postJson('/api/chat/learning/feedback', [
            'learningMemoryId' => $memoryId,
            'feedback' => 'helpful',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('updatedCount', 1)
            ->assertJsonPath('feedback', 'helpful');

        $updated = DB::table('chat_learning_memories')->where('id', $memoryId)->first();

        $this->assertSame(4, (int) $updated->score);
        $this->assertContains('feedback:helpful', json_decode($updated->tags, true));
    }

    public function test_feedback_requires_auth_and_valid_feedback_value(): void
    {
        $this->postJson('/api/chat/learning/feedback', [
            'reference' => 'chat:feedback-unauthenticated',
            'feedback' => 'worked',
        ])->assertUnauthorized();

        [$token] = $this->signupUser('invalid-feedback@example.com');

        $this->postJson('/api/chat/learning/feedback', [
            'reference' => 'chat:feedback-invalid',
            'feedback' => 'maybe',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertStatus(422)
            ->assertJsonPath('ok', false);
    }

    private function signupUser(string $email): array
    {
        $response = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => $email,
            'password' => 'secret123',
        ])->assertCreated();

        return [$response->json('token'), $response->json('user.id')];
    }

    private function insertMemory(int $userId, array $overrides = []): int
    {
        return (int) DB::table('chat_learning_memories')->insertGetId(array_merge([
            'user_id' => $userId,
            'project_key' => null,
            'project_name' => null,
            'mode' => 'chat',
            'model_key' => 'gpt-5.4-mini',
            'skill_id' => null,
            'score' => 3,
            'prompt' => 'Fix the preview.',
            'response_summary' => 'Inline the script.',
            'tags' => json_encode(['chat']),
            'reference' => 'chat:feedback-default',
            'created_at' => now(),
            'updated_at' => now(),
        ], $overrides));
    }
}
