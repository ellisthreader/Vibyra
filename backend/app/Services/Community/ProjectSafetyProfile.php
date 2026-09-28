<?php

namespace App\Services\Community;

use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;

trait ProjectSafetyProfile
{
    private function safetyProfile(string $status, array $findings, int $sourceFileCount): array
    {
        $sourceCopy = $sourceFileCount > 0
            ? "listing, preview, media, and {$sourceFileCount} source file".($sourceFileCount === 1 ? '' : 's')
            : 'listing, preview, and media';
        $score = $this->deterministicScore($findings);

        if ($status === self::DENIED) {
            return [
                'rating' => 'blocked',
                'score' => min($score, 20),
                'summary' => 'Blocked by automated safety review after checking '.$sourceCopy.'.',
            ];
        }

        if ($status === self::UNDER_REVIEW) {
            $rating = $this->hasOnlyConfidenceFindings($findings)
                ? 'needs_review'
                : ($score < 45 ? 'high_risk' : ($score < 70 ? 'needs_review' : 'caution'));

            return [
                'rating' => $rating,
                'score' => $score,
                'summary' => 'Needs human review after automated checks of '.$sourceCopy.'.',
            ];
        }

        return [
            'rating' => $score >= 90 ? 'safe' : ($score >= 80 ? 'low_risk' : 'caution'),
            'score' => $score,
            'summary' => 'Passed automated safety review for '.$sourceCopy.'.',
        ];
    }

    private function deterministicScore(array $findings): int
    {
        $score = 100;
        $seenCodes = [];
        $capCodes = [
            'auth_payment_surface',
            'sensitive_browser_api',
            'tracking_or_fingerprint',
            'untrusted_network_endpoint',
            'dependency_install_script',
        ];

        foreach ($findings as $finding) {
            $code = (string) ($finding['code'] ?? '');
            if ($code === '') {
                continue;
            }
            $impact = (int) ($finding['scoreImpact'] ?? $this->scoreImpact($code));
            if (isset($seenCodes[$code]) && in_array($code, $capCodes, true)) {
                continue;
            }
            $duplicatePenalty = isset($seenCodes[$code]) ? max(3, (int) floor($impact / 3)) : $impact;
            $score -= $duplicatePenalty;
            $seenCodes[$code] = true;
        }

        return max(1, min(100, $score));
    }

    private function scoreImpact(string $code): int
    {
        return [
            'private_key' => 95,
            'env_file' => 90,
            'openai_key' => 90,
            'stripe_secret' => 92,
            'github_token' => 92,
            'bearer_token' => 85,
            'credential_file' => 95,
            'inline_script_content' => 85,
            'dangerous_embed' => 82,
            'form_submission' => 48,
            'meta_refresh_or_base' => 72,
            'inline_event_handler' => 78,
            'javascript_url' => 88,
            'html_data_url' => 84,
            'svg_data_url' => 76,
            'srcdoc' => 80,
            'css_script_escape' => 84,
            'unsafe_image_url' => 72,
            'credentialed_image_url' => 80,
            'private_image_host' => 78,
            'source_snapshot_missing' => 24,
            'source_snapshot_truncated' => 16,
            'preview_html_too_large' => 26,
            'moderation_unavailable' => 18,
            'env_source_file' => 26,
            'dynamic_code_execution' => 34,
            'shell_command_execution' => 38,
            'destructive_file_operation' => 34,
            'hidden_remote_script' => 24,
            'browser_storage_exfiltration' => 58,
            'sensitive_browser_api' => 12,
            'untrusted_network_endpoint' => 14,
            'auth_payment_surface' => 8,
            'crypto_or_wallet_behavior' => 30,
            'tracking_or_fingerprint' => 16,
            'obfuscated_code' => 42,
            'dependency_install_script' => 16,
            'minified_large_blob' => 24,
            'meta_pixel_or_tracking' => 55,
            'content_moderation_blocked' => 95,
        ][$code] ?? 25;
    }

    private function hasOnlyConfidenceFindings(array $findings): bool
    {
        $confidenceCodes = [
            'source_snapshot_missing',
            'source_snapshot_truncated',
            'moderation_unavailable',
            'preview_html_too_large',
            'ai_review_skipped_large_project',
        ];

        foreach ($findings as $finding) {
            $code = (string) ($finding['code'] ?? '');
            if ($code !== '' && ! in_array($code, $confidenceCodes, true)) {
                return false;
            }
        }

        return $findings !== [];
    }

    private function findingCodeExists(array $findings, string $code): bool
    {
        foreach ($findings as $finding) {
            if (($finding['code'] ?? '') === $code) {
                return true;
            }
        }

        return false;
    }

    private function hasDenyFindings(array $findings): bool
    {
        foreach ($findings as $finding) {
            if (($finding['severity'] ?? '') === 'deny') {
                return true;
            }
        }

        return false;
    }

    private function hasUnderReviewFindings(array $findings): bool
    {
        foreach ($findings as $finding) {
            if (($finding['severity'] ?? '') === 'under_review') {
                return true;
            }
        }

        return false;
    }
}
