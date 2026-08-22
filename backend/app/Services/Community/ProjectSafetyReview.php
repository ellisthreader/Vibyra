<?php

namespace App\Services\Community;

use App\Services\ContentModeration;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;

class ProjectSafetyReview
{
    use ProjectSafetyReviewAi;
    use ProjectSafetyPreviewSanitization;
    use ProjectSafetySourceNormalization;
    use ProjectSafetySourceBodyScanning;
    use ProjectSafetyContentScanning;
    use ProjectSafetyProfile;
    private const PREVIEW_HTML_MAX_CHARACTERS = 180000;
    private const SOURCE_FILE_MAX_CHARACTERS = 24000;
    private const SOURCE_FILE_MAX_COUNT = 80;

    public const APPROVED = 'approved';
    public const DENIED = 'denied';
    public const UNDER_REVIEW = 'under_review';

    public function __construct(
        private readonly ContentModeration $moderation,
        private readonly ProjectAiSafetyReview $aiReview,
    )
    {
    }

    public function review(array $input): array
    {
        $findings = [];
        $title = (string) Arr::get($input, 'title', '');
        $description = (string) Arr::get($input, 'description', '');
        $stack = (string) Arr::get($input, 'stack', '');
        $tags = (array) Arr::get($input, 'tags', []);
        $images = array_values(array_filter((array) Arr::get($input, 'images', [])));
        $previewHtml = (string) Arr::get($input, 'previewHtml', '');
        $sourceFiles = $this->normalizeSourceFiles(Arr::get($input, 'sourceFiles', []));
        $sourceReview = (array) Arr::get($input, 'sourceReview', []);

        if ($this->publishReviewTemporarilyDisabled()) {
            $ignoredFindings = [];
            $sanitizedHtml = $this->sanitizePreviewHtml($previewHtml, $ignoredFindings);
            $findings[] = [
                'code' => 'temp_publish_review_disabled',
                'severity' => 'info',
                'target' => 'review_status',
                'message' => 'Publish safety review is temporarily disabled.',
                'scoreImpact' => 0,
            ];

            return $this->decision(
                self::APPROVED,
                $findings,
                $sanitizedHtml,
                'Project approved while publish safety review is temporarily disabled.',
                count($sourceFiles),
            );
        }

        $this->scanTextForSecrets($title."\n".$description."\n".$stack."\n".implode("\n", $tags), 'metadata', $findings);
        $this->scanTextForSecrets($previewHtml, 'preview_html', $findings);
        $this->scanImages($images, $findings);
        $sanitizedHtml = $this->sanitizePreviewHtml($previewHtml, $findings);
        $this->scanSourceFiles($sourceFiles, $sourceReview, $findings);

        if ($this->hasDenyFindings($findings)) {
            return $this->decision(self::DENIED, $findings, $sanitizedHtml, 'Project failed deterministic safety checks.', count($sourceFiles));
        }

        if ($this->forceApproveForTesting()) {
            try {
                $this->moderation->assertLocalTextAllowed(
                    trim($title.' '.$description.' '.$stack.' '.implode(' ', $tags)),
                    'community.publish'
                );
            } catch (HttpResponseException $exception) {
                $payload = json_decode($exception->getResponse()->getContent(), true) ?: [];
                $findings[] = [
                    'code' => (string) Arr::get($payload, 'moderation.reason', 'content_moderation_blocked'),
                    'severity' => 'deny',
                    'target' => 'moderation',
                    'message' => (string) ($payload['error'] ?? 'Project content does not meet Vibyra PG community rules.'),
                    'categories' => Arr::get($payload, 'moderation.categories', []),
                    'scoreImpact' => $this->scoreImpact((string) Arr::get($payload, 'moderation.reason', 'content_moderation_blocked')),
                ];

                return $this->decision(self::DENIED, $findings, $sanitizedHtml, 'Project content does not meet Vibyra PG community rules.', count($sourceFiles));
            }

            $findings[] = [
                'code' => 'temp_publish_force_approved',
                'severity' => 'info',
                'target' => 'review_status',
                'message' => 'Temporary testing override approved this project without remote review.',
                'scoreImpact' => 0,
            ];

            return $this->decision(self::APPROVED, $findings, $sanitizedHtml, 'Project force-approved for temporary testing.', count($sourceFiles));
        }

        try {
            $moderationDecision = $this->moderation->assertModerationInputAllowed([
                'text' => trim($title.' '.$description.' '.$stack.' '.implode(' ', $tags)),
                'images' => $images,
            ], 'community.publish', false);
        } catch (HttpResponseException $exception) {
            $payload = json_decode($exception->getResponse()->getContent(), true) ?: [];
            $findings[] = [
                'code' => (string) Arr::get($payload, 'moderation.reason', 'content_moderation_blocked'),
                'severity' => 'deny',
                'target' => 'moderation',
                'message' => (string) ($payload['error'] ?? 'Project content does not meet Vibyra PG community rules.'),
                'categories' => Arr::get($payload, 'moderation.categories', []),
                'scoreImpact' => $this->scoreImpact((string) Arr::get($payload, 'moderation.reason', 'content_moderation_blocked')),
            ];

            return $this->decision(self::DENIED, $findings, $sanitizedHtml, 'Project content does not meet Vibyra PG community rules.', count($sourceFiles));
        }

        if (($moderationDecision['warning'] ?? null) !== null) {
            $findings[] = [
                'code' => (string) ($moderationDecision['reason'] ?? 'moderation_unavailable'),
                'severity' => 'under_review',
                'target' => 'moderation',
                'message' => (string) $moderationDecision['warning'],
                'scoreImpact' => $this->scoreImpact((string) ($moderationDecision['reason'] ?? 'moderation_unavailable')),
            ];
        }

        $status = $this->hasUnderReviewFindings($findings) ? self::UNDER_REVIEW : self::APPROVED;
        $reason = $status === self::UNDER_REVIEW
            ? 'Project is under review before it can be public.'
            : 'Project passed automated safety review.';
        $decision = $this->decision($status, $findings, $sanitizedHtml, $reason, count($sourceFiles));

        if ($status === self::UNDER_REVIEW) {
            return $this->maybeForceApproveUnderReviewForTesting($this->maybeApplyAiReview($decision, [
                'title' => $title,
                'description' => $description,
                'stack' => $stack,
                'tags' => $tags,
                'sourceFiles' => $sourceFiles,
            ]));
        }

        return $decision;
    }

    private function decision(string $status, array $findings, ?string $sanitizedHtml, string $reason, int $sourceFileCount): array
    {
        $profile = $this->safetyProfile($status, $findings, $sourceFileCount);

        return [
            'status' => $status,
            'findings' => array_values($findings),
            'sanitizedHtml' => $sanitizedHtml,
            'reason' => $reason,
            'rating' => $profile['rating'],
            'score' => $profile['score'],
            'summary' => $profile['summary'],
            'public' => $status === self::APPROVED,
        ];
    }
}
