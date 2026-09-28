<?php

namespace App\Services\Community;

use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;

trait ProjectSafetyReviewAi
{
    private function maybeApplyAiReview(array $decision, array $context): array
    {
        $config = (array) config('moderation.publish_ai_review', []);
        if ($this->shouldSkipAiForSize((array) ($context['sourceFiles'] ?? []), $config)
            && $this->aiWouldOtherwiseRun($decision, $config)) {
            $decision['findings'][] = [
                'code' => 'ai_review_skipped_large_project',
                'severity' => 'info',
                'target' => 'ai_review',
                'message' => 'Project is too large for cost-controlled AI review and needs human approval.',
                'scoreImpact' => 0,
            ];
            $decision['summary'] = 'Needs human review because the project is too large for cost-controlled AI review.';

            return $decision;
        }

        $ai = $this->aiReview->review([
            ...$context,
            'findings' => $decision['findings'],
            'score' => $decision['score'],
        ]);
        if (! $ai) {
            return $decision;
        }

        $finding = [
            'code' => 'ai_safety_review',
            'severity' => 'info',
            'target' => 'ai_review',
            'message' => $ai['summary'],
            'decision' => $ai['decision'],
            'confidence' => $ai['confidence'],
            'score' => $ai['score'],
            'model' => (string) ($config['model'] ?? 'openai/gpt-5.4-nano'),
        ];
        $decision['findings'][] = $finding;

        if ($ai['decision'] === 'approve'
            && $ai['confidence'] >= (float) ($config['approve_confidence'] ?? 0.84)
            && $ai['score'] >= (int) ($config['approve_score'] ?? 78)) {
            return [
                ...$decision,
                'status' => self::APPROVED,
                'reason' => 'Project passed automated and AI safety review.',
                'rating' => $ai['score'] >= 88 ? 'safe' : 'low_risk',
                'score' => $ai['score'],
                'summary' => $ai['summary'] ?: 'Passed AI safety review.',
                'public' => true,
            ];
        }

        if ($ai['decision'] === 'deny'
            && $ai['confidence'] >= (float) ($config['deny_confidence'] ?? 0.90)) {
            return [
                ...$decision,
                'status' => self::DENIED,
                'reason' => 'Project failed AI safety review.',
                'rating' => 'blocked',
                'score' => min((int) $decision['score'], max(1, (int) $ai['score'])),
                'summary' => $ai['summary'] ?: 'Blocked by AI safety review.',
                'public' => false,
            ];
        }

        return [
            ...$decision,
            'summary' => $ai['summary'] ?: $decision['summary'],
            'score' => min((int) $decision['score'], max(1, (int) $ai['score'] ?: (int) $decision['score'])),
        ];
    }

    private function maybeForceApproveUnderReviewForTesting(array $decision): array
    {
        if (! $this->forceApproveForTesting()
            || ($decision['status'] ?? null) !== self::UNDER_REVIEW) {
            return $decision;
        }

        $decision['findings'][] = [
            'code' => 'temp_under_review_force_approved',
            'severity' => 'info',
            'target' => 'review_status',
            'message' => 'Temporary testing override converted under-review status to approved.',
            'scoreImpact' => 0,
        ];

        return [
            ...$decision,
            'status' => self::APPROVED,
            'reason' => 'Project force-approved for temporary local testing.',
            'rating' => $decision['rating'] === 'needs_review' ? 'caution' : $decision['rating'],
            'summary' => 'Temporary testing override approved this project instantly.',
            'public' => true,
        ];
    }

    private function forceApproveForTesting(): bool
    {
        return (bool) config('moderation.publish_force_approve_under_review', false);
    }

    private function publishReviewTemporarilyDisabled(): bool
    {
        return (bool) config('moderation.publish_review_temporarily_disabled', false);
    }

    private function aiWouldOtherwiseRun(array $decision, array $config): bool
    {
        if (! (bool) ($config['enabled'] ?? false) || ! config('services.openrouter.key')) {
            return false;
        }

        $score = (int) ($decision['score'] ?? 0);
        if ($score < (int) ($config['min_score'] ?? 35) || $score > (int) ($config['max_score'] ?? 74)) {
            return false;
        }

        return ! $this->findingCodeExists((array) ($decision['findings'] ?? []), 'source_snapshot_missing');
    }

    private function shouldSkipAiForSize(array $files, array $config): bool
    {
        $maxFiles = (int) ($config['max_source_files'] ?? 24);
        if (count($files) > $maxFiles) {
            return true;
        }

        $maxCharacters = (int) ($config['max_source_characters'] ?? 120000);
        $characters = 0;
        foreach ($files as $file) {
            if (! is_array($file)) {
                continue;
            }
            $characters += mb_strlen((string) ($file['body'] ?? ''));
            if ($characters > $maxCharacters) {
                return true;
            }
        }

        return false;
    }
}
