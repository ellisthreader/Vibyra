<?php

namespace App\Http\Controllers\Concerns;

use App\Models\PublishedProject;
use App\Models\PublishedProjectComment;
use App\Models\PublishedProjectDeployment;
use App\Models\User;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;

trait CommunityPublishingUrlPolicy
{
    private function isSafePublishedAppUrl(string $url): bool
    {
        $url = trim($url);
        if ($url === '') {
            return false;
        }

        if (str_starts_with($url, '/') && ! str_starts_with($url, '//')) {
            return str_starts_with($url, '/api/community/projects/');
        }

        if (filter_var($url, FILTER_VALIDATE_URL) === false) {
            return false;
        }

        $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        if ($scheme !== 'https' || $host === '') {
            return false;
        }

        return ! $this->isPrivatePublishedHost($host);
    }

    private function containsUnsafePublishedUrl(string $body, array $context = []): bool
    {
        if (! preg_match_all('/(?:https?:\/\/|\/\/)[^\s"\'<>`]+/i', $body, $matches, PREG_OFFSET_CAPTURE)) {
            return false;
        }

        foreach ($matches[0] as [$rawUrl, $offset]) {
            if ($this->isAllowedPublishedUrlLiteral($rawUrl, $body, (int) $offset, $context)) {
                continue;
            }

            $url = str_starts_with($rawUrl, '//') ? 'https:'.$rawUrl : $rawUrl;
            if (filter_var($url, FILTER_VALIDATE_URL) === false || (string) parse_url($url, PHP_URL_HOST) === '') {
                continue;
            }

            if (! $this->isSafePublishedAppUrl($url)) {
                return true;
            }
        }

        return false;
    }

    private function neutralizeCompiledPrivateUrlLiterals(string $body, array $context = []): string
    {
        $path = strtolower((string) ($context['path'] ?? ''));
        if (! preg_match('/\.(?:js|mjs|cjs)$/', $path)) {
            return $body;
        }

        return preg_replace_callback(
            '/(?:https?:\/\/|\/\/)[^\s"\'<>`]+/i',
            function (array $match): string {
                $rawUrl = (string) ($match[0][0] ?? '');
                $url = str_starts_with($rawUrl, '//') ? 'https:'.$rawUrl : $rawUrl;
                $host = strtolower((string) parse_url($url, PHP_URL_HOST));

                return $host !== '' && $this->isPrivatePublishedHost($host) ? 'about:blank' : $rawUrl;
            },
            $body,
            -1,
            $count,
            PREG_OFFSET_CAPTURE
        ) ?? $body;
    }

    private function isAllowedPublishedUrlLiteral(string $rawUrl, string $body, int $offset, array $context): bool
    {
        $path = strtolower((string) ($context['path'] ?? ''));

        if ($path === 'composer.lock') {
            return true;
        }

        if (str_starts_with($path, 'config/') && str_ends_with($path, '.php') && preg_match('#^http://(?:localhost|127\.0\.0\.1(?::\d+)?)/?$#i', $rawUrl) === 1) {
            return true;
        }

        if (preg_match('#^http://www\.w3\.org/(?:1998/Math/MathML|1999/xhtml|1999/xlink|2000/svg|XML/1998/namespace)$#i', $rawUrl) === 1) {
            return true;
        }

        if (! preg_match('/\.(?:js|mjs|cjs)$/', $path)) {
            return false;
        }

        if (! preg_match('#^http://localhost/?$#i', $rawUrl)) {
            return false;
        }

        $before = substr($body, max(0, $offset - 80), 80);
        return str_contains($before, 'new URL(');
    }

    private function isPrivatePublishedHost(string $host): bool
    {
        $host = trim(strtolower($host), '[]');
        if ($host === ''
            || $host === 'localhost'
            || $host === 'host.docker.internal'
            || str_ends_with($host, '.localhost')
            || str_ends_with($host, '.local')
            || str_ends_with($host, '.lan')
            || str_ends_with($host, '.internal')) {
            return true;
        }

        if (str_starts_with($host, '::ffff:')) {
            $host = substr($host, 7);
        }

        if (filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            $ip = ip2long($host);
            if ($ip === false) {
                return true;
            }

            $ranges = [
                ['0.0.0.0', '0.255.255.255'],
                ['10.0.0.0', '10.255.255.255'],
                ['127.0.0.0', '127.255.255.255'],
                ['169.254.0.0', '169.254.255.255'],
                ['172.16.0.0', '172.31.255.255'],
                ['192.168.0.0', '192.168.255.255'],
            ];

            foreach ($ranges as [$start, $end]) {
                if ($ip >= ip2long($start) && $ip <= ip2long($end)) {
                    return true;
                }
            }

            return false;
        }

        if (filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
            return $host === '::1'
                || str_starts_with($host, 'fe80:')
                || str_starts_with($host, 'fc')
                || str_starts_with($host, 'fd');
        }

        return false;
    }
}
