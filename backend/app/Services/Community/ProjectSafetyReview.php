<?php

namespace App\Services\Community;

use App\Services\ContentModeration;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;

class ProjectSafetyReview
{
    private const PREVIEW_HTML_MAX_CHARACTERS = 180000;

    public const APPROVED = 'approved';
    public const DENIED = 'denied';
    public const UNDER_REVIEW = 'under_review';

    public function __construct(private readonly ContentModeration $moderation)
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

        $this->scanTextForSecrets($title."\n".$description."\n".$stack."\n".implode("\n", $tags), 'metadata', $findings);
        $this->scanTextForSecrets($previewHtml, 'preview_html', $findings);
        $this->scanImages($images, $findings);
        $sanitizedHtml = $this->sanitizePreviewHtml($previewHtml, $findings);

        if ($this->hasDenyFindings($findings)) {
            return $this->decision(self::DENIED, $findings, $sanitizedHtml, 'Project failed deterministic safety checks.');
        }

        if ($this->hasUnderReviewFindings($findings)) {
            return $this->decision(self::UNDER_REVIEW, $findings, $sanitizedHtml, 'Project is under review before it can be public.');
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
            ];

            return $this->decision(self::DENIED, $findings, $sanitizedHtml, 'Project content does not meet Vibyra PG community rules.');
        }

        if (($moderationDecision['warning'] ?? null) !== null) {
            $findings[] = [
                'code' => (string) ($moderationDecision['reason'] ?? 'moderation_unavailable'),
                'severity' => 'under_review',
                'target' => 'moderation',
                'message' => (string) $moderationDecision['warning'],
            ];

            return $this->decision(self::UNDER_REVIEW, $findings, $sanitizedHtml, 'Project is under review before it can be public.');
        }

        return $this->decision(self::APPROVED, $findings, $sanitizedHtml, 'Project passed automated safety review.');
    }

    private function decision(string $status, array $findings, ?string $sanitizedHtml, string $reason): array
    {
        return [
            'status' => $status,
            'findings' => array_values($findings),
            'sanitizedHtml' => $sanitizedHtml,
            'reason' => $reason,
            'public' => $status === self::APPROVED,
        ];
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
            ];
        }

        $patterns = [
            'script_tag' => '/<\s*script\b/i',
            'dangerous_embed' => '/<\s*(?:iframe|frame|object|embed|applet)\b/i',
            'form_control' => '/<\s*(?:form|input|button|textarea|select|option)\b/i',
            'meta_refresh_or_base' => '/<\s*(?:base\b|meta\b[^>]*http-equiv)/i',
            'external_stylesheet' => '/<\s*link\b[^>]*rel\s*=\s*([\'"]?)stylesheet\1/i',
            'inline_event_handler' => '/\son[a-z]+\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s>]+)/i',
            'javascript_url' => '/(?:href|src|action)\s*=\s*(?:"\s*javascript:|\'\s*javascript:|javascript:)/i',
            'html_data_url' => '/data\s*:\s*text\/html/i',
            'svg_data_url' => '/data\s*:\s*image\/svg\+xml/i',
            'srcdoc' => '/\ssrcdoc\s*=/i',
            'srcset' => '/\ssrcset\s*=/i',
            'css_script_escape' => '/(?:expression\s*\(|@import|url\s*\(\s*[\'"]?\s*javascript:)/i',
        ];

        foreach ($patterns as $code => $pattern) {
            if (preg_match($pattern, $html) === 1) {
                $findings[] = [
                    'code' => $code,
                    'severity' => 'deny',
                    'target' => 'preview_html',
                    'message' => 'Published previews cannot include executable, embedded, form, navigation, or unsafe URL content.',
                ];
            }
        }

        $html = preg_replace('/<\s*script\b[^>]*>.*?<\s*\/\s*script\s*>/is', '', $html) ?? '';
        $html = preg_replace('/<\s*(?:iframe|frame|object|embed|applet|form|input|button|textarea|select|option|base)\b[^>]*>.*?(?:<\s*\/\s*(?:iframe|frame|object|embed|applet|form|textarea|select)\s*>)?/is', '', $html) ?? '';
        $html = preg_replace('/<\s*meta\b[^>]*http-equiv[^>]*>/is', '', $html) ?? '';
        $html = preg_replace('/<\s*link\b[^>]*rel\s*=\s*([\'"]?)stylesheet\1[^>]*>/is', '', $html) ?? '';
        $html = preg_replace('/\son[a-z]+\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s>]+)/is', '', $html) ?? '';
        $html = preg_replace('/\s(?:srcdoc|srcset)\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s>]+)/is', '', $html) ?? '';
        $html = preg_replace('/(href|src|action)\s*=\s*(["\']?)\s*javascript:[^"\'>\s]*/is', '$1="#"', $html) ?? '';

        return Str::limit(trim($html), self::PREVIEW_HTML_MAX_CHARACTERS, '');
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
        ];
    }

    private function isPrivateHost(string $host): bool
    {
        $host = trim($host, '[]');

        if (! filter_var($host, FILTER_VALIDATE_IP)) {
            return false;
        }

        return ! filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE);
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
