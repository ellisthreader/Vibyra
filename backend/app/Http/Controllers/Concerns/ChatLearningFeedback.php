<?php

namespace App\Http\Controllers\Concerns;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

trait ChatLearningFeedback
{
    public function chatLearningFeedback(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);

        [$feedback, $feedbackError] = $this->normalizeChatLearningFeedback($request->input('feedback'));
        if ($feedbackError !== null) {
            return $this->json(['ok' => false, 'error' => $feedbackError], 422);
        }

        [$reference, $referenceError] = $this->normalizeChatLearningReference(
            $request->input('reference', $request->input('chatReference', $request->input('chat_reference')))
        );
        if ($referenceError !== null) {
            return $this->json(['ok' => false, 'error' => $referenceError], 422);
        }

        [$memoryId, $memoryIdError] = $this->normalizeChatLearningMemoryId(
            $request->input('learningMemoryId', $request->input('memoryId', $request->input('memory_id')))
        );
        if ($memoryIdError !== null) {
            return $this->json(['ok' => false, 'error' => $memoryIdError], 422);
        }

        if ($reference === null && $memoryId === null) {
            return $this->json(['ok' => false, 'error' => 'Provide a chat reference or learning memory id.'], 422);
        }

        $query = DB::table('chat_learning_memories')
            ->where('user_id', $user->id);

        if ($reference !== null) {
            $query->where('reference', $reference);
        } else {
            $query->where('id', $memoryId);
        }

        $rows = $query
            ->select(['id', 'score', 'tags'])
            ->get();

        $columns = $this->chatLearningFeedbackColumns();
        $updatedCount = 0;

        foreach ($rows as $row) {
            $updates = [
                'score' => $this->chatLearningFeedbackScore((int) $row->score, $feedback),
                'tags' => $this->chatLearningFeedbackTags($row->tags, $feedback),
                'updated_at' => now(),
            ];

            if ($columns['outcome_status'] ?? false) {
                $updates['outcome_status'] = $feedback;
            }
            if ($columns['feedback_score'] ?? false) {
                $updates['feedback_score'] = $this->chatLearningFeedbackNumericScore($feedback);
            }
            if ($columns['feedback_source'] ?? false) {
                $updates['feedback_source'] = 'api';
            }
            if ($columns['feedback_at'] ?? false) {
                $updates['feedback_at'] = now();
            }

            $updatedCount += DB::table('chat_learning_memories')
                ->where('user_id', $user->id)
                ->where('id', $row->id)
                ->update($updates);
        }

        return $this->json([
            'ok' => true,
            'updatedCount' => $updatedCount,
            'feedback' => $feedback,
        ]);
    }

    private function normalizeChatLearningFeedback(mixed $value): array
    {
        $feedback = strtolower(trim((string) $value));
        $feedback = trim((string) preg_replace('/[\s-]+/', '_', $feedback), '_');

        if (! in_array($feedback, ['worked', 'did_not_work', 'helpful', 'not_helpful'], true)) {
            return [null, 'Feedback must be worked, did_not_work, helpful, or not_helpful.'];
        }

        return [$feedback, null];
    }

    private function normalizeChatLearningReference(mixed $value): array
    {
        if ($value === null || $value === '') {
            return [null, null];
        }

        if (! is_scalar($value)) {
            return [null, 'Chat reference must be a string.'];
        }

        $reference = trim((string) $value);
        if ($reference === '') {
            return [null, null];
        }

        if (strlen($reference) > 120 || preg_match('/\A[A-Za-z0-9:._-]+\z/', $reference) !== 1) {
            return [null, 'Chat reference is invalid.'];
        }

        return [$reference, null];
    }

    private function normalizeChatLearningMemoryId(mixed $value): array
    {
        if ($value === null || $value === '') {
            return [null, null];
        }

        if (is_int($value)) {
            $id = $value;
        } elseif (is_string($value) && ctype_digit($value)) {
            $id = (int) $value;
        } else {
            return [null, 'Learning memory id must be a positive integer.'];
        }

        if ($id < 1) {
            return [null, 'Learning memory id must be a positive integer.'];
        }

        return [$id, null];
    }

    private function chatLearningFeedbackColumns(): array
    {
        return [
            'outcome_status' => Schema::hasColumn('chat_learning_memories', 'outcome_status'),
            'feedback_score' => Schema::hasColumn('chat_learning_memories', 'feedback_score'),
            'feedback_source' => Schema::hasColumn('chat_learning_memories', 'feedback_source'),
            'feedback_at' => Schema::hasColumn('chat_learning_memories', 'feedback_at'),
        ];
    }

    private function chatLearningFeedbackScore(int $currentScore, string $feedback): int
    {
        return match ($feedback) {
            'worked' => max($currentScore, 5),
            'helpful' => max($currentScore, 4),
            'did_not_work' => 0,
            'not_helpful' => min($currentScore, 1),
            default => $currentScore,
        };
    }

    private function chatLearningFeedbackNumericScore(string $feedback): int
    {
        return in_array($feedback, ['worked', 'helpful'], true) ? 1 : -1;
    }

    private function chatLearningFeedbackTags(mixed $encodedTags, string $feedback): string
    {
        $decoded = is_string($encodedTags) && $encodedTags !== ''
            ? json_decode($encodedTags, true)
            : [];

        $tags = [];
        foreach (is_array($decoded) ? $decoded : [] as $tag) {
            if (! is_string($tag) || str_starts_with($tag, 'feedback:')) {
                continue;
            }
            $tag = trim($tag);
            if ($tag !== '') {
                $tags[$tag] = true;
            }
        }

        $tags['feedback:' . $feedback] = true;
        $tags[in_array($feedback, ['worked', 'helpful'], true) ? 'feedback:positive' : 'feedback:negative'] = true;

        return (string) json_encode(array_keys($tags), JSON_UNESCAPED_SLASHES);
    }
}
