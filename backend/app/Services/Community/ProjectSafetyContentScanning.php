<?php

namespace App\Services\Community;

use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;

trait ProjectSafetyContentScanning
{
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
}
