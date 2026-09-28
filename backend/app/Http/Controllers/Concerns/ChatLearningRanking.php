<?php

namespace App\Http\Controllers\Concerns;

use Illuminate\Support\Str;

trait ChatLearningRanking
{
    private function chatLearningRankMemory(object $row, array $tokens, array $queryTags, ?string $projectKey, string $mode): array
    {
        $tags = $this->chatLearningDecodeTags($this->chatLearningRowValue($row, 'tags'));
        $prompt = (string) ($this->chatLearningRowValue($row, 'prompt') ?? '');
        $summary = (string) ($this->chatLearningRowValue($row, 'response_summary') ?? '');
        $extra = (string) ($this->chatLearningRowValue($row, 'context_summary') ?? '').' '
            .(string) ($this->chatLearningRowValue($row, 'error_signature') ?? '').' '
            .(string) ($this->chatLearningRowValue($row, 'file_paths') ?? '');
        $overlap = $this->chatLearningOverlap($tokens, $this->chatLearningTokens($prompt.' '.$summary.' '.$extra.' '.implode(' ', $tags)));
        $tagOverlap = $this->chatLearningOverlap($queryTags, $tags);
        $negativePenalty = $this->chatLearningNegativePenalty($row, $tags);
        $recencySource = $this->chatLearningRowValue($row, 'feedback_at')
            ?? $this->chatLearningRowValue($row, 'updated_at')
            ?? $this->chatLearningRowValue($row, 'created_at');
        $score = ($overlap * 1.8)
            + $this->chatLearningProjectFit($projectKey, $this->chatLearningRowValue($row, 'project_key'))
            + $this->chatLearningModeFit($mode, (string) ($this->chatLearningRowValue($row, 'mode') ?? ''))
            + $this->chatLearningStoredScore($row)
            + $this->chatLearningRecencyScore($recencySource)
            + min(2.0, $tagOverlap * 0.7)
            + $this->chatLearningFeedbackTagScore($tags)
            + $negativePenalty;

        return [
            'row' => $row,
            'score' => $score,
            'overlap' => $overlap,
            'tag_overlap' => $tagOverlap,
            'tags' => $tags,
            'suppressed' => $negativePenalty <= -50.0,
        ];
    }

    private function chatLearningOverlap(array $left, array $right): int
    {
        if ($left === [] || $right === []) {
            return 0;
        }
        $right = array_flip($right);
        $overlap = 0;
        foreach ($left as $value) {
            if (isset($right[$value])) {
                $overlap++;
            }
        }
        return $overlap;
    }

    private function chatLearningProjectFit(?string $projectKey, $memoryProjectKey): float
    {
        $memoryProjectKey = is_string($memoryProjectKey) && $memoryProjectKey !== '' ? $memoryProjectKey : null;
        if ($projectKey === null) {
            return $memoryProjectKey === null ? 1.0 : -0.8;
        }
        if ($memoryProjectKey === $projectKey) {
            return 2.4;
        }
        return $memoryProjectKey === null ? 0.6 : -2.0;
    }

    private function chatLearningModeFit(string $mode, string $memoryMode): float
    {
        if ($memoryMode === $mode) {
            return 1.4;
        }
        if ($memoryMode === 'chat') {
            return 0.2;
        }
        return -0.6;
    }

    private function chatLearningStoredScore(object $row): float
    {
        $score = $this->chatLearningNumeric($this->chatLearningRowValue($row, 'score'));
        $feedback = $this->chatLearningNumeric($this->chatLearningRowValue($row, 'feedback_score'));
        $value = $score === null ? 0.0 : min(1.5, max(0.0, ($score - 1.0) * 0.5));
        if ($feedback !== null) {
            $value += $feedback >= 0 ? min(2.0, $feedback) : max(-8.0, $feedback * 2.0);
        }
        return $value;
    }

    private function chatLearningFeedbackTagScore(array $tags): float
    {
        if (array_intersect($tags, ['feedback:worked', 'feedback:positive'])) {
            return 1.0;
        }
        if (in_array('feedback:helpful', $tags, true)) {
            return 0.7;
        }
        return 0.0;
    }

    private function chatLearningRecencyScore($createdAt): float
    {
        $time = is_string($createdAt) ? strtotime($createdAt) : (is_object($createdAt) && method_exists($createdAt, 'getTimestamp') ? $createdAt->getTimestamp() : false);
        if ($time === false) {
            return 0.0;
        }
        $days = max(0.0, (time() - $time) / 86400);
        return match (true) {
            $days <= 2 => 1.2,
            $days <= 14 => 0.9,
            $days <= 45 => 0.5,
            $days <= 120 => 0.2,
            default => 0.0,
        };
    }

    private function chatLearningNegativePenalty(object $row, array $tags): float
    {
        foreach (['failed', 'is_failed', 'negative', 'is_negative', 'marked_failed', 'marked_negative'] as $column) {
            if (property_exists($row, $column) && $this->chatLearningTruthy($row->{$column})) {
                return -100.0;
            }
        }
        foreach (['status', 'outcome', 'outcome_status', 'feedback', 'verdict'] as $column) {
            $value = $this->chatLearningRowValue($row, $column);
            if (is_string($value) && in_array(Str::lower(trim($value)), ['failed', 'failure', 'negative', 'bad', 'incorrect', 'rejected', 'not_useful', 'not_helpful', 'did_not_work', 'thumbs_down'], true)) {
                return -100.0;
            }
        }
        if (array_intersect($tags, ['failed', 'failure', 'failed-memory', 'negative', 'negative-memory', 'not-useful', 'not_useful', 'thumbs_down', 'feedback:negative', 'feedback:not_helpful', 'feedback:did_not_work'])) {
            return -100.0;
        }
        return 0.0;
    }

    private function chatLearningTruthy($value): bool
    {
        if (is_bool($value)) {
            return $value;
        }
        if (is_numeric($value)) {
            return (float) $value > 0;
        }
        return in_array(Str::lower(trim((string) $value)), ['1', 'true', 'yes', 'y', 'failed', 'failure', 'negative', 'bad', 'rejected', 'incorrect', 'not_useful', 'not_helpful', 'did_not_work', 'thumbs_down'], true);
    }

    private function chatLearningNumeric($value): ?float
    {
        return is_numeric($value) ? (float) $value : null;
    }

}
