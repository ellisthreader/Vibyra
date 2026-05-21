<?php

namespace App\Services\Community;

use App\Services\ContentModeration;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;

class ProjectSafetyReview
{
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

        $this->scanTextForSecrets($title."\n".$description."\n".$stack."\n".implode("\n", $tags), 'metadata', $findings);
        $this->scanTextForSecrets($previewHtml, 'preview_html', $findings);
        $this->scanImages($images, $findings);
        $sanitizedHtml = $this->sanitizePreviewHtml($previewHtml, $findings);
        $this->scanSourceFiles($sourceFiles, $sourceReview, $findings);

        if ($this->hasDenyFindings($findings)) {
            return $this->decision(self::DENIED, $findings, $sanitizedHtml, 'Project failed deterministic safety checks.', count($sourceFiles));
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
            return $this->maybeApplyAiReview($decision, [
                'title' => $title,
                'description' => $description,
                'stack' => $stack,
                'tags' => $tags,
                'sourceFiles' => $sourceFiles,
            ]);
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

    private function sanitizePreviewHtml(string $html, array &$findings): ?string
    {
        $html = trim($html);
        if ($html === '') {
            return null;
        }

        if (mb_strlen($html) > self::PREVIEW_HTML_MAX_CHARACTERS) {
            $findings[] = [
                'code' => 'preview_html_too_large',
                'severity' => 'under_review',
                'target' => 'preview_html',
                'message' => 'Large published previews need review before they can be public.',
                'scoreImpact' => $this->scoreImpact('preview_html_too_large'),
            ];
        }

        $patterns = [
            'inline_script_content' => '/<\s*script\b(?![^>]*\bsrc\s*=)[^>]*>.*?<\s*\/\s*script\s*>/is',
            'dangerous_embed' => '/<\s*(?:iframe|frame|object|embed|applet)\b/i',
            'form_submission' => '/<\s*form\b/i',
            'meta_refresh_or_base' => '/<\s*(?:base\b|meta\b[^>]*http-equiv)/i',
            'inline_event_handler' => '/\son[a-z]+\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s>]+)/i',
            'javascript_url' => '/(?:href|src|action)\s*=\s*(?:"\s*javascript:|\'\s*javascript:|javascript:)/i',
            'html_data_url' => '/data\s*:\s*text\/html/i',
            'svg_data_url' => '/data\s*:\s*image\/svg\+xml/i',
            'srcdoc' => '/\ssrcdoc\s*=/i',
            'css_script_escape' => '/(?:expression\s*\(|@import|url\s*\(\s*[\'"]?\s*javascript:)/i',
            'meta_pixel_or_tracking' => '/\b(?:facebook\.com\/tr|googletagmanager\.com|google-analytics\.com|hotjar\.com|segment\.com)\b/i',
        ];

        foreach ($patterns as $code => $pattern) {
            if (preg_match($pattern, $html) === 1) {
                $findings[] = [
                    'code' => $code,
                    'severity' => 'deny',
                    'target' => 'preview_html',
                    'message' => 'Published previews cannot include executable, embedded, form, navigation, or unsafe URL content.',
                    'scoreImpact' => $this->scoreImpact($code),
                ];
            }
        }

        $html = preg_replace('/<\s*script\b[^>]*>.*?<\s*\/\s*script\s*>/is', '', $html) ?? '';
        $html = preg_replace('/<\s*(?:iframe|frame|object|embed|applet|form|base)\b[^>]*>.*?(?:<\s*\/\s*(?:iframe|frame|object|embed|applet|form)\s*>)?/is', '', $html) ?? '';
        $html = preg_replace('/<\s*meta\b[^>]*http-equiv[^>]*>/is', '', $html) ?? '';
        $html = preg_replace('/<\s*link\b[^>]*rel\s*=\s*([\'"]?)stylesheet\1[^>]*>/is', '', $html) ?? '';
        $html = preg_replace('/\son[a-z]+\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s>]+)/is', '', $html) ?? '';
        $html = preg_replace('/\s(?:srcdoc|srcset)\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s>]+)/is', '', $html) ?? '';
        $html = preg_replace('/(href|src|action)\s*=\s*(["\']?)\s*javascript:[^"\'>\s]*/is', '$1="#"', $html) ?? '';

        return Str::limit(trim($html), self::PREVIEW_HTML_MAX_CHARACTERS, '');
    }

    private function normalizeSourceFiles(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $files = [];
        foreach (array_slice($value, 0, self::SOURCE_FILE_MAX_COUNT) as $item) {
            if (! is_array($item)) {
                continue;
            }

            $path = Str::limit(trim((string) ($item['path'] ?? '')), 240, '');
            if ($path === '') {
                continue;
            }

            $files[] = [
                'path' => $path,
                'language' => Str::limit(trim((string) ($item['language'] ?? '')), 40, ''),
                'body' => Str::limit((string) ($item['body'] ?? ''), self::SOURCE_FILE_MAX_CHARACTERS, ''),
            ];
        }

        return $files;
    }

    private function scanSourceFiles(array $files, array $sourceReview, array &$findings): void
    {
        if ($files === []) {
            $findings[] = [
                'code' => 'source_snapshot_missing',
                'severity' => 'under_review',
                'target' => 'source',
                'message' => 'The project source snapshot was not available for automated review.',
                'scoreImpact' => $this->scoreImpact('source_snapshot_missing'),
            ];
            return;
        }

        if ((bool) ($sourceReview['truncated'] ?? false)) {
            $findings[] = [
                'code' => 'source_snapshot_truncated',
                'severity' => 'under_review',
                'target' => 'source',
                'message' => 'Only part of the project source could be reviewed automatically.',
                'scoreImpact' => $this->scoreImpact('source_snapshot_truncated'),
            ];
        }

        foreach ($files as $file) {
            $path = (string) $file['path'];
            $body = (string) $file['body'];

            $this->scanTextForSecrets($body, 'source_file', $findings);
            $this->scanSourcePath($path, $findings);
            $this->scanSourceBody($path, $body, $findings);
        }
    }

    private function scanSourcePath(string $path, array &$findings): void
    {
        $lower = strtolower($path);

        if (preg_match('/(^|\/)\.env(?:\.|$)/', $lower) === 1) {
            $findings[] = [
                'code' => 'env_source_file',
                'severity' => 'under_review',
                'target' => 'source_file',
                'message' => 'Environment files need human review before the project can be public.',
                'path' => $path,
                'scoreImpact' => $this->scoreImpact('env_source_file'),
            ];
        }

        if (preg_match('/\.(?:pem|key|p12|pfx)$/', $lower) === 1) {
            $findings[] = [
                'code' => 'credential_file',
                'severity' => 'deny',
                'target' => 'source_file',
                'message' => 'Published projects cannot include credential or key files.',
                'path' => $path,
                'scoreImpact' => $this->scoreImpact('credential_file'),
            ];
        }
    }

    private function scanSourceBody(string $path, string $body, array &$findings): void
    {
        if (trim($body) === '') {
            return;
        }

        $patterns = [
            'dynamic_code_execution' => '/\b(?:eval\s*\(|new\s+Function\s*\(|Function\s*\()/i',
            'shell_command_execution' => '/\b(?:child_process|execSync\s*\(|spawnSync\s*\(|shell_exec\s*\(|passthru\s*\(|proc_open\s*\(|system\s*\()/i',
            'destructive_file_operation' => '/\b(?:rm\s+-rf|fs\.rmSync\s*\(|unlinkSync\s*\(|rmdirSync\s*\()/i',
            'hidden_remote_script' => '/<\s*script\b[^>]*\bsrc\s*=\s*["\']https?:\/\//i',
            'browser_storage_exfiltration' => '/\b(?:localStorage|sessionStorage|document\.cookie)\b[\s\S]{0,240}\b(?:fetch\s*\(|XMLHttpRequest|sendBeacon)\b/i',
            'sensitive_browser_api' => '/\b(?:getUserMedia|getDisplayMedia|geolocation|getCurrentPosition|clipboard\.read|Notification\.requestPermission)\b/i',
            'untrusted_network_endpoint' => '/\b(?:fetch|axios|XMLHttpRequest|sendBeacon)\b[\s\S]{0,160}\bhttps?:\/\/(?!api\.openai\.com|openrouter\.ai|fonts\.googleapis\.com|fonts\.gstatic\.com)[^\'"\s)]+/i',
            'auth_payment_surface' => '/\b(?:stripe|checkout|payment|password|oauth|jwt|session_token|access_token|refresh_token)\b/i',
            'crypto_or_wallet_behavior' => '/\b(?:ethereum|walletconnect|metamask|solana|web3|bitcoin|privateKey|seed phrase)\b/i',
            'tracking_or_fingerprint' => '/\b(?:fingerprint|canvas\.toDataURL|navigator\.userAgent|deviceMemory|hardwareConcurrency)\b/i',
            'obfuscated_code' => '/\b(?:atob|btoa|Buffer\.from)\b[\s\S]{0,120}\b(?:eval|Function|exec)\b/i',
        ];

        foreach ($patterns as $code => $pattern) {
            if (preg_match($pattern, $body) === 1) {
                $findings[] = [
                    'code' => $code,
                    'severity' => 'under_review',
                    'target' => 'source_file',
                    'message' => 'Source code contains behavior that needs human review before the project can be public.',
                    'path' => $path,
                    'scoreImpact' => $this->scoreImpact($code),
                ];
            }
        }

        if ($this->isPackageJson($path) && preg_match('/"(?:preinstall|postinstall|prepare)"\s*:/i', $body) === 1) {
            $findings[] = [
                'code' => 'dependency_install_script',
                'severity' => 'under_review',
                'target' => 'source_file',
                'message' => 'Install scripts need review before the project can be public.',
                'path' => $path,
                'scoreImpact' => $this->scoreImpact('dependency_install_script'),
            ];
        }

        if ($this->hasLargeEncodedBlob($body)) {
            $findings[] = [
                'code' => 'minified_large_blob',
                'severity' => 'under_review',
                'target' => 'source_file',
                'message' => 'Large minified or encoded code needs review before the project can be public.',
                'path' => $path,
                'scoreImpact' => $this->scoreImpact('minified_large_blob'),
            ];
        }
    }

    private function scanTextForSecrets(string $text, string $target, array &$findings): void
    {
        if (trim($text) === '') {
            return;
        }

        $patterns = [
            'private_key' => '/-----BEGIN [A-Z ]*PRIVATE KEY-----/',
            'env_file' => '/(?:^|\n)\s*(?:APP_KEY|DB_PASSWORD|OPENAI_API_KEY|STRIPE_SECRET|AWS_SECRET_ACCESS_KEY)\s*=/i',
            'openai_key' => '/\bsk-[A-Za-z0-9_-]{20,}\b/',
            'stripe_secret' => '/\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/',
            'github_token' => '/\bgithub_pat_[A-Za-z0-9_]{20,}\b/',
            'bearer_token' => '/\bBearer\s+[A-Za-z0-9._~+\/=-]{24,}\b/i',
        ];

        foreach ($patterns as $code => $pattern) {
            if (preg_match($pattern, $text) === 1) {
                $findings[] = [
                    'code' => $code,
                    'severity' => 'deny',
                    'target' => $target,
                    'message' => 'Published projects cannot include secrets, credentials, private keys, or access tokens.',
                    'scoreImpact' => $this->scoreImpact($code),
                ];
            }
        }
    }

    private function scanImages(array $images, array &$findings): void
    {
        foreach ($images as $image) {
            $url = is_array($image) ? (string) ($image['url'] ?? '') : (string) $image;
            if (str_starts_with($url, 'data:image/')) {
                continue;
            }

            $parts = parse_url($url);
            $host = strtolower((string) ($parts['host'] ?? ''));
            $scheme = strtolower((string) ($parts['scheme'] ?? ''));

            if ($scheme !== 'https' || $host === '') {
                $findings[] = $this->imageFinding('unsafe_image_url', $url);
                continue;
            }

            if (($parts['user'] ?? null) !== null || ($parts['pass'] ?? null) !== null) {
                $findings[] = $this->imageFinding('credentialed_image_url', $url);
            }

            if ($host === 'localhost' || str_ends_with($host, '.localhost') || str_ends_with($host, '.local') || $this->isPrivateHost($host)) {
                $findings[] = $this->imageFinding('private_image_host', $url);
            }
        }
    }

    private function imageFinding(string $code, string $url): array
    {
        return [
            'code' => $code,
            'severity' => 'deny',
            'target' => 'media',
            'message' => 'Published media must use public HTTPS image URLs or bounded image data URLs.',
            'value' => Str::limit($url, 160, ''),
            'scoreImpact' => $this->scoreImpact($code),
        ];
    }

    private function isPackageJson(string $path): bool
    {
        return strtolower(basename($path)) === 'package.json';
    }

    private function hasLargeEncodedBlob(string $body): bool
    {
        foreach (preg_split('/\R/', $body) ?: [] as $line) {
            if (strlen($line) > 8000) {
                return true;
            }
        }

        return preg_match('/[A-Za-z0-9+\/]{3000,}={0,2}/', $body) === 1;
    }

    private function isPrivateHost(string $host): bool
    {
        $host = trim($host, '[]');

        if (! filter_var($host, FILTER_VALIDATE_IP)) {
            return false;
        }

        return ! filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE);
    }

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
