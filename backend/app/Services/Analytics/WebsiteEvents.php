<?php

namespace App\Services\Analytics;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class WebsiteEvents
{
    public const ROUTES = ['/', '/downloads', '/benchmarks', '/login', '/signup',
        '/billing', '/account', '/account/downloads', '/legal/privacy', '/legal/terms'];
    public const CTA_IDS = ['nav_downloads', 'nav_login', 'home_get_vibyra',
        'home_login', 'downloads_windows', 'downloads_linux', 'downloads_linux_deb',
        'downloads_macos_arm64', 'downloads_macos_x64', 'signup_submit',
        'pricing_opened', 'faq_opened'];
    public const PLATFORMS = ['windows', 'linux', 'linux-deb', 'macos-arm64', 'macos-x64'];

    public function record(Request $request, WebsiteConsent $consent, string $event,
        ?string $dimension, ?int $seconds = null, ?string $id = null): bool
    {
        if (! config('owner_analytics.ingestion_enabled', true)) return false;
        if (! $this->allowed($event, $dimension, $seconds)) return false;
        $subject = $consent->subject($request);
        return DB::transaction(function () use ($request, $consent, $event, $dimension, $seconds, $subject, $id): bool {
            $current = $consent->current($request, true);
            if (! in_array($current['choice'], ['aggregate', 'linked'], true)) return false;
            $properties = $seconds ? ['seconds' => $seconds] : null;
            DB::table('analytics_events')->insertOrIgnore([
                'event_id' => $id ?? (string) Str::uuid(),
                'user_id' => $current['choice'] === 'linked' ? $request->user('web')?->id : null,
                'surface' => 'website', 'event' => $event, 'dimension' => $dimension,
                'platform' => $event === 'website_download_clicked' ? $dimension : null,
                'visitor_hash' => $subject,
                'consent_subject_hash' => $subject,
                'country_code' => app(AnalyticsCountry::class)->fromRequest($request),
                'engaged_seconds' => $seconds, 'schema_version' => 1,
                'properties' => $properties ? json_encode($properties, JSON_THROW_ON_ERROR) : null,
                'occurred_at' => now(), 'created_at' => now(),
            ]);
            return true;
        });
    }

    public function allowed(string $event, ?string $dimension, ?int $seconds): bool
    {
        return match ($event) {
            'website_page_view' => in_array($dimension, self::ROUTES, true) && $seconds === null,
            'website_cta_clicked' => in_array($dimension, self::CTA_IDS, true) && $seconds === null,
            'website_download_clicked' => in_array($dimension, self::PLATFORMS, true) && $seconds === null,
            'website_engagement_interval' => in_array($dimension, self::ROUTES, true)
                && $seconds !== null && $seconds >= 1 && $seconds <= 30,
            default => false,
        };
    }
}
