<?php

namespace App\Services\Analytics;

use Illuminate\Http\Request;

class WebsiteAcquisition
{
    public function fromRequest(Request $request, array $input = []): array
    {
        $query = $input ?: $request->query();
        $source = $this->token($query['utm_source'] ?? null, 48);
        $medium = $this->token($query['utm_medium'] ?? null, 32);
        $campaign = $this->token($query['utm_campaign'] ?? null, 64);
        $referrer = $this->domain($input['referrer_domain'] ?? $request->header('referer'));
        $ownHost = strtolower((string) $request->getHost());
        if ($referrer === $ownHost) $referrer = null;

        $channel = match (true) {
            in_array($medium, ['cpc', 'ppc', 'paid', 'paid_social', 'display'], true) => 'paid',
            in_array($medium, ['email', 'newsletter'], true) => 'email',
            in_array($medium, ['social', 'organic_social'], true) => 'social',
            in_array($medium, ['organic', 'search'], true) => 'search',
            $source !== null => 'other',
            $referrer === null => 'direct',
            (bool) preg_match('/(^|\.)(google|bing|duckduckgo|yahoo|baidu)\./', $referrer) => 'search',
            (bool) preg_match('/(^|\.)(facebook|instagram|linkedin|reddit|tiktok|youtube|x|twitter)\./', $referrer) => 'social',
            default => 'referral',
        };

        return ['acquisition_channel' => $channel, 'source' => $source,
            'medium' => $medium, 'campaign' => $campaign, 'referrer_domain' => $referrer];
    }

    private function token(mixed $value, int $length): ?string
    {
        if (! is_string($value)) return null;
        $value = strtolower(trim($value));
        return strlen($value) <= $length && preg_match('/^[a-z0-9][a-z0-9._-]*$/D', $value)
            ? $value : null;
    }

    private function domain(mixed $value): ?string
    {
        if (! is_string($value) || strlen($value) > 300) return null;
        $host = parse_url($value, PHP_URL_HOST);
        if ($host === null && ! str_contains($value, '/')) $host = $value;
        $host = strtolower((string) $host);
        return strlen($host) <= 100 && preg_match('/^[a-z0-9.-]+\.[a-z]{2,}$/D', $host)
            ? $host : null;
    }
}
